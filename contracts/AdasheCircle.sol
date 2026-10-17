// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AdasheCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant MIN_MEMBERS = 2;
    uint8 public constant MAX_MEMBERS = 12;
    uint256 public constant GRACE_PERIOD = 240 hours;
    uint256 public constant MAX_EXTENSION = 30 days;

    IERC20 public immutable usdc;

    uint256 private _nextCircleId = 1;

    enum Frequency {
        WEEKLY,
        MONTHLY
    }

    enum CircleStatus {
        PENDING,
        ACTIVE,
        COMPLETED
    }

    enum ContributionStatus {
        PENDING,
        PAID,
        LATE_PAID,
        DEFAULTED,
        COVERED_BY_RESERVE
    }

    struct Circle {
        uint256 circleId;
        address creator;
        string name;
        uint256 contributionAmount;
        uint8 memberCount;
        Frequency frequency;
        uint8 weekday;
        uint8 anchorDay;
        bytes32 pinHash;
        CircleStatus status;
        uint256 startTime;
        uint8 currentPeriod;
        address[] payoutOrder;
        uint256 reserveAmount;
        uint256 gracePeriod;
    }

    struct MemberRecord {
        bool approved;
        bool joined;
        uint256 reserveBalance;
        uint256 debtBalance;
        uint256 removedAt;
        address replacedBy;
    }

    struct ContributionRecord {
        ContributionStatus status;
        uint256 paidAmount;
        uint256 paidAt;
        uint256 extensionDeadline;
        bool extensionRequested;
        bool extensionApproved;
    }

    struct Period {
        address recipient;
        uint256 deadline;
        uint256 grossEntitlement;
        bool payoutReleased;
        bool payoutWithheld;
        uint256 withheldAmount;
        uint256 claimableAmount;
        bool initialized;
        address[] participants;
        mapping(address => ContributionRecord) contributions;
    }

    mapping(uint256 => Circle) public circles;
    mapping(uint256 => mapping(address => MemberRecord)) public memberRecords;
    mapping(uint256 => mapping(uint256 => Period)) private _periods;

    mapping(uint256 => mapping(address => bool)) public isInPayoutOrder;
    mapping(uint256 => mapping(address => uint256)) private _positionPlusOne;
    mapping(uint256 => mapping(address => address)) public pendingReplacement;

    event CircleCreated(uint256 indexed circleId, address indexed creator, string name);
    event MemberJoined(uint256 indexed circleId, address indexed member);
    event MemberApproved(uint256 indexed circleId, address indexed member);
    event MemberRemoved(uint256 indexed circleId, address indexed member);
    event PendingMemberRemoved(uint256 indexed circleId, address indexed member, uint8 indexed slotIndex);
    event SlotReassigned(uint256 indexed circleId, uint8 indexed slotIndex, address indexed newMember);
    event CircleActivated(uint256 indexed circleId, uint256 startTime, uint256 period0Deadline);
    event ContributionPaid(
        uint256 indexed circleId,
        uint256 indexed periodIndex,
        address indexed contributor,
        uint256 amount,
        ContributionStatus status
    );
    event ContributionDefaulted(
        uint256 indexed circleId,
        uint256 indexed periodIndex,
        address indexed contributor,
        uint256 debtAdded
    );
    event ReserveCoverageApplied(
        uint256 indexed circleId,
        uint256 indexed periodIndex,
        address indexed contributor,
        uint256 coveredAmount,
        uint256 debtAdded
    );
    event PeriodFinalized(uint256 indexed circleId, uint256 indexed periodIndex, uint256 totalCollected);
    event PayoutReleased(uint256 indexed circleId, uint256 indexed periodIndex, address indexed recipient, uint256 amount);
    event PayoutWithheld(uint256 indexed circleId, uint256 indexed periodIndex, address indexed recipient, uint256 amount);
    event MemberReplaced(uint256 indexed circleId, address indexed outgoing, address indexed replacement);
    event ExtensionRequested(uint256 indexed circleId, uint256 indexed periodIndex, address indexed contributor);
    event ExtensionApproved(
        uint256 indexed circleId,
        uint256 indexed periodIndex,
        address indexed contributor,
        uint256 newDeadline
    );
    event DebtRepaid(uint256 indexed circleId, address indexed member, uint256 amount);
    event ReserveRefunded(uint256 indexed circleId, address indexed member, uint256 amount);
    event WithheldPayoutClaimed(
        uint256 indexed circleId,
        uint256 indexed periodIndex,
        address indexed recipient,
        uint256 amount
    );

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "USDC address is zero");
        require(usdcAddress.code.length > 0, "USDC: not a contract");
        usdc = IERC20(usdcAddress);
    }

    function createCircle(
        string calldata name,
        uint256 contributionAmount,
        uint8 memberCount,
        Frequency frequency,
        uint8 weekday,
        uint8 anchorDay,
        address[] calldata payoutOrder,
        bytes32 pinHash
    ) external returns (uint256 circleId) {
        require(memberCount >= MIN_MEMBERS && memberCount <= MAX_MEMBERS, "invalid member count");
        require(contributionAmount > 0, "contribution must be > 0");
        require(payoutOrder.length == memberCount, "payout order length mismatch");

        if (frequency == Frequency.WEEKLY) {
            require(weekday <= 6, "invalid weekday");
        } else {
            require(anchorDay >= 1 && anchorDay <= 31, "invalid anchor day");
        }

        circleId = _nextCircleId++;
        Circle storage c = circles[circleId];
        c.circleId = circleId;
        c.creator = msg.sender;
        c.name = name;
        c.contributionAmount = contributionAmount;
        c.memberCount = memberCount;
        c.frequency = frequency;
        c.weekday = weekday;
        c.anchorDay = anchorDay;
        c.pinHash = pinHash;
        c.status = CircleStatus.PENDING;
        c.currentPeriod = 0;
        c.reserveAmount = contributionAmount;
        c.gracePeriod = GRACE_PERIOD;

        for (uint256 i = 0; i < payoutOrder.length; i++) {
            address member = payoutOrder[i];
            require(member != address(0), "zero payout member");
            require(!isInPayoutOrder[circleId][member], "duplicate payout member");

            c.payoutOrder.push(member);
            isInPayoutOrder[circleId][member] = true;
            _positionPlusOne[circleId][member] = i + 1;
        }

        emit CircleCreated(circleId, msg.sender, name);
    }

    function joinCircle(uint256 circleId, bytes32 pinHash) external {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.PENDING, "circle not pending");
        require(pinHash == c.pinHash, "invalid pin");
        require(isInPayoutOrder[circleId][msg.sender], "not in payout order");

        MemberRecord storage mr = memberRecords[circleId][msg.sender];
        require(!mr.joined, "already joined");

        mr.joined = true;
        emit MemberJoined(circleId, msg.sender);
    }

    function approveMember(uint256 circleId, address member) external {
        Circle storage c = _requireCircle(circleId);
        require(msg.sender == c.creator, "only creator");
        require(c.status == CircleStatus.PENDING, "circle not pending");
        require(isInPayoutOrder[circleId][member], "not in payout order");

        MemberRecord storage mr = memberRecords[circleId][member];
        require(mr.joined, "member not joined");
        require(!mr.approved, "already approved");

        mr.approved = true;
        emit MemberApproved(circleId, member);

        if (_allApproved(circleId)) {
            c.status = CircleStatus.ACTIVE;
            c.startTime = block.timestamp;
            _initializePeriod(circleId, 0);
            emit CircleActivated(circleId, c.startTime, _periods[circleId][0].deadline);
        }
    }

    function removePendingMember(uint256 circleId, address member) external {
        Circle storage c = _requireCircle(circleId);
        require(msg.sender == c.creator, "only creator");
        require(c.status == CircleStatus.PENDING, "circle not pending");
        require(isInPayoutOrder[circleId][member], "not in payout order");

        MemberRecord storage mr = memberRecords[circleId][member];
        require(mr.joined || mr.approved, "member not joined/approved");

        mr.joined = false;
        mr.approved = false;

        // Slot remains in payoutOrder and must be reassigned via reassignPendingSlot before activation.
        uint256 posPlusOne = _positionPlusOne[circleId][member];
        require(posPlusOne != 0, "member not positioned");
        emit PendingMemberRemoved(circleId, member, uint8(posPlusOne - 1));
    }

    function reassignPendingSlot(uint256 circleId, uint8 slotIndex, address newAddress) external {
        Circle storage c = _requireCircle(circleId);
        require(msg.sender == c.creator, "only creator");
        require(c.status == CircleStatus.PENDING, "circle not pending");
        require(slotIndex < c.memberCount, "invalid slot index");
        require(newAddress != address(0), "new address is zero");
        require(!isInPayoutOrder[circleId][newAddress], "already in payout order");

        address oldAddress = c.payoutOrder[slotIndex];
        require(oldAddress != address(0), "invalid old address");

        MemberRecord storage newRecord = memberRecords[circleId][newAddress];
        require(!newRecord.joined && !newRecord.approved, "new address already joined/approved");

        MemberRecord storage oldRecord = memberRecords[circleId][oldAddress];
        oldRecord.joined = false;
        oldRecord.approved = false;

        c.payoutOrder[slotIndex] = newAddress;

        isInPayoutOrder[circleId][oldAddress] = false;
        _positionPlusOne[circleId][oldAddress] = 0;

        isInPayoutOrder[circleId][newAddress] = true;
        _positionPlusOne[circleId][newAddress] = uint256(slotIndex) + 1;

        emit SlotReassigned(circleId, slotIndex, newAddress);
    }

    function contribute(uint256 circleId, uint256 periodIndex) external {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.ACTIVE, "circle not active");
        require(periodIndex == c.currentPeriod, "not current period");

        Period storage p = _periods[circleId][periodIndex];
        require(p.initialized, "period not initialized");
        require(_isPeriodContributor(circleId, periodIndex, msg.sender), "not period contributor");

        MemberRecord storage mr = memberRecords[circleId][msg.sender];
        require(mr.approved && mr.removedAt == 0, "not approved member");

        ContributionRecord storage cr = p.contributions[msg.sender];
        require(
            cr.status == ContributionStatus.PENDING && cr.paidAmount == 0,
            "already settled this period"
        );

        uint256 finalDeadline = _finalDeadline(p.deadline, cr.extensionApproved, cr.extensionDeadline, c.gracePeriod);
        require(block.timestamp <= finalDeadline, "final deadline passed");

        usdc.safeTransferFrom(msg.sender, address(this), c.contributionAmount);

        cr.paidAmount = c.contributionAmount;
        cr.paidAt = block.timestamp;
        cr.status = block.timestamp > p.deadline ? ContributionStatus.LATE_PAID : ContributionStatus.PAID;

        emit ContributionPaid(circleId, periodIndex, msg.sender, c.contributionAmount, cr.status);
    }

    function repayDebt(uint256 circleId) external nonReentrant {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.ACTIVE || c.status == CircleStatus.COMPLETED, "invalid circle status");

        MemberRecord storage mr = memberRecords[circleId][msg.sender];
        uint256 debt = mr.debtBalance;
        require(debt > 0, "no debt");

        mr.debtBalance = 0;
        usdc.safeTransferFrom(msg.sender, address(this), debt);

        emit DebtRepaid(circleId, msg.sender, debt);
    }

    function finalizePeriod(uint256 circleId) external nonReentrant {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.ACTIVE, "circle not active");

        uint256 periodIndex = c.currentPeriod;
        Period storage p = _periods[circleId][periodIndex];
        require(p.initialized, "period not initialized");
        require(!p.payoutReleased && p.claimableAmount == 0, "period already finalized");

        uint256 totalCollected = 0;

        for (uint256 i = 0; i < p.participants.length; i++) {
            address member = p.participants[i];
            if (member == p.recipient) continue;

            ContributionRecord storage cr = p.contributions[member];
            uint256 memberFinalDeadline = _finalDeadline(
                p.deadline,
                cr.extensionApproved,
                cr.extensionDeadline,
                c.gracePeriod
            );
            require(block.timestamp > memberFinalDeadline, "not all final deadlines passed");

            if (
                cr.status == ContributionStatus.PAID ||
                cr.status == ContributionStatus.LATE_PAID ||
                cr.status == ContributionStatus.COVERED_BY_RESERVE
            ) {
                totalCollected += cr.paidAmount;
                continue;
            }

            MemberRecord storage mr = memberRecords[circleId][member];
            uint256 debtAdded = 0;

            if (mr.reserveBalance >= c.contributionAmount) {
                mr.reserveBalance -= c.contributionAmount;
                mr.debtBalance += c.contributionAmount;

                cr.status = ContributionStatus.COVERED_BY_RESERVE;
                cr.paidAmount = c.contributionAmount;
                cr.paidAt = block.timestamp;

                totalCollected += c.contributionAmount;
                debtAdded = c.contributionAmount;

                emit ReserveCoverageApplied(circleId, periodIndex, member, c.contributionAmount, debtAdded);
            } else if (mr.reserveBalance > 0) {
                uint256 covered = mr.reserveBalance;
                mr.reserveBalance = 0;

                uint256 uncovered = c.contributionAmount - covered;
                mr.debtBalance += uncovered;

                cr.status = ContributionStatus.COVERED_BY_RESERVE;
                cr.paidAmount = covered;
                cr.paidAt = block.timestamp;

                totalCollected += covered;
                debtAdded = uncovered;

                emit ReserveCoverageApplied(circleId, periodIndex, member, covered, debtAdded);
            } else {
                mr.debtBalance += c.contributionAmount;

                cr.status = ContributionStatus.DEFAULTED;
                cr.paidAmount = 0;
                cr.paidAt = block.timestamp;

                debtAdded = c.contributionAmount;
            }

            emit ContributionDefaulted(circleId, periodIndex, member, debtAdded);
        }

        MemberRecord storage recipientRecord = memberRecords[circleId][p.recipient];
        uint256 reserveCredit = c.reserveAmount <= totalCollected ? c.reserveAmount : totalCollected;
        uint256 netPayout = totalCollected - reserveCredit;

        recipientRecord.reserveBalance += reserveCredit;
        p.claimableAmount = netPayout;

        if (recipientRecord.debtBalance > 0) {
            p.payoutWithheld = true;
            p.withheldAmount = netPayout;
            emit PayoutWithheld(circleId, periodIndex, p.recipient, netPayout);
        }

        c.currentPeriod += 1;
        if (c.currentPeriod == c.memberCount) {
            c.status = CircleStatus.COMPLETED;
        } else {
            _initializePeriod(circleId, c.currentPeriod);
        }

        emit PeriodFinalized(circleId, periodIndex, totalCollected);
    }

    function claimPayout(uint256 circleId, uint256 periodIndex) external nonReentrant {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.ACTIVE || c.status == CircleStatus.COMPLETED, "invalid circle status");

        Period storage p = _periods[circleId][periodIndex];
        require(p.initialized, "period not initialized");
        require(msg.sender == p.recipient, "not recipient");
        require(p.claimableAmount > 0, "no claimable payout");

        MemberRecord storage mr = memberRecords[circleId][msg.sender];
        require(mr.debtBalance == 0, "debt outstanding");

        uint256 payoutAmount = p.claimableAmount;
        p.claimableAmount = 0;
        p.payoutReleased = true;
        p.payoutWithheld = false;
        p.withheldAmount = 0;

        if (payoutAmount > 0) {
            usdc.safeTransfer(msg.sender, payoutAmount);
        }

        emit WithheldPayoutClaimed(circleId, periodIndex, msg.sender, payoutAmount);
        emit PayoutReleased(circleId, periodIndex, msg.sender, payoutAmount);
    }

    function approveReplacement(uint256 circleId, address outgoing, address replacement) external {
        Circle storage c = _requireCircle(circleId);
        require(msg.sender == c.creator, "only creator");
        require(c.status == CircleStatus.ACTIVE, "circle not active");
        require(replacement != address(0), "replacement is zero");

        MemberRecord storage outgoingRecord = memberRecords[circleId][outgoing];
        require(outgoingRecord.approved && outgoingRecord.removedAt == 0, "outgoing not active");
        require(outgoingRecord.debtBalance == 0, "outgoing has debt");
        require(isInPayoutOrder[circleId][outgoing], "outgoing not in payout order");
        require(!isInPayoutOrder[circleId][replacement], "replacement already member");

        MemberRecord storage replacementRecord = memberRecords[circleId][replacement];
        require(!replacementRecord.joined && !replacementRecord.approved, "replacement pending/member");
        require(
            replacementRecord.reserveBalance == 0 &&
                replacementRecord.debtBalance == 0 &&
                replacementRecord.removedAt == 0 &&
                replacementRecord.replacedBy == address(0),
            "replacement has history"
        );

        pendingReplacement[circleId][outgoing] = replacement;
    }

    function executeReplacement(uint256 circleId, address outgoing) external {
        Circle storage c = _requireCircle(circleId);
        require(msg.sender == circles[circleId].creator, "Only creator");
        require(c.status == CircleStatus.ACTIVE, "circle not active");

        Period storage current = _periods[circleId][c.currentPeriod];
        if (!(current.payoutReleased || current.payoutWithheld)) {
            require(block.timestamp > _finalDeadlineForCurrentPeriod(circleId), "Cannot replace mid-period");
        }

        address replacement = pendingReplacement[circleId][outgoing];
        require(replacement != address(0), "no approved replacement");

        MemberRecord storage outgoingRecord = memberRecords[circleId][outgoing];
        require(outgoingRecord.approved && outgoingRecord.removedAt == 0, "outgoing not active");
        require(outgoingRecord.debtBalance == 0, "outgoing has debt");

        uint256 posPlusOne = _positionPlusOne[circleId][outgoing];
        require(posPlusOne != 0, "outgoing not positioned");

        outgoingRecord.removedAt = block.timestamp;
        outgoingRecord.replacedBy = replacement;
        outgoingRecord.approved = false;
        outgoingRecord.joined = false;

        MemberRecord storage replacementRecord = memberRecords[circleId][replacement];
        replacementRecord.approved = true;
        replacementRecord.joined = true;

        uint256 index = posPlusOne - 1;
        circles[circleId].payoutOrder[index] = replacement;

        isInPayoutOrder[circleId][outgoing] = false;
        isInPayoutOrder[circleId][replacement] = true;
        _positionPlusOne[circleId][replacement] = posPlusOne;
        _positionPlusOne[circleId][outgoing] = 0;

        delete pendingReplacement[circleId][outgoing];

        emit MemberReplaced(circleId, outgoing, replacement);
    }

    function claimReserveRefund(uint256 circleId) external nonReentrant {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.COMPLETED, "circle not completed");

        MemberRecord storage mr = memberRecords[circleId][msg.sender];
        uint256 refund = mr.reserveBalance;
        require(refund > 0, "no reserve");

        mr.reserveBalance = 0;
        usdc.safeTransfer(msg.sender, refund);

        emit ReserveRefunded(circleId, msg.sender, refund);
    }

    function settleOwnDebtFromWithheldPayout(uint256 circleId, uint256 periodIndex) external nonReentrant {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.COMPLETED, "circle not completed");

        Period storage p = _periods[circleId][periodIndex];
        require(p.initialized, "period not initialized");
        require(msg.sender == p.recipient, "not recipient");
        require(p.payoutWithheld && !p.payoutReleased, "payout not withheld");

        MemberRecord storage mr = memberRecords[circleId][msg.sender];
        require(mr.debtBalance > 0, "no debt");
        require(p.claimableAmount > 0, "no claimable payout");

        uint256 amountToDebt = mr.debtBalance <= p.claimableAmount ? mr.debtBalance : p.claimableAmount;
        mr.debtBalance -= amountToDebt;
        p.claimableAmount -= amountToDebt;

        uint256 payoutAmount = 0;
        if (mr.debtBalance == 0 && p.claimableAmount > 0) {
            payoutAmount = p.claimableAmount;
            p.claimableAmount = 0;
            usdc.safeTransfer(msg.sender, payoutAmount);
        }

        p.payoutReleased = true;
        p.payoutWithheld = false;
        p.withheldAmount = 0;
        p.claimableAmount = 0;

        emit WithheldPayoutClaimed(circleId, periodIndex, msg.sender, payoutAmount);
        emit PayoutReleased(circleId, periodIndex, msg.sender, payoutAmount);
    }

    function requestExtension(uint256 circleId, uint256 periodIndex) external {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.ACTIVE, "circle not active");
        require(periodIndex == c.currentPeriod, "not current period");

        Period storage p = _periods[circleId][periodIndex];
        require(p.initialized, "period not initialized");
        require(_isPeriodContributor(circleId, periodIndex, msg.sender), "not contributor");

        ContributionRecord storage cr = p.contributions[msg.sender];
        require(cr.status == ContributionStatus.PENDING && cr.paidAmount == 0, "already settled");
        require(!cr.extensionRequested, "already requested");

        cr.extensionRequested = true;
        emit ExtensionRequested(circleId, periodIndex, msg.sender);
    }

    function approveExtension(
        uint256 circleId,
        uint256 periodIndex,
        address contributor,
        uint256 newDeadline
    ) external {
        Circle storage c = _requireCircle(circleId);
        require(c.status == CircleStatus.ACTIVE, "circle not active");
        require(periodIndex == c.currentPeriod, "not current period");

        Period storage p = _periods[circleId][periodIndex];
        require(p.initialized, "period not initialized");
        require(msg.sender == p.recipient, "only recipient");
        require(_isPeriodContributor(circleId, periodIndex, contributor), "not contributor");

        ContributionRecord storage cr = p.contributions[contributor];
        require(cr.extensionRequested, "extension not requested");
        require(!cr.extensionApproved, "extension already approved");
        require(cr.status == ContributionStatus.PENDING && cr.paidAmount == 0, "already settled");
        require(newDeadline > p.deadline, "deadline must extend");
        require(newDeadline <= p.deadline + MAX_EXTENSION, "extension too long");

        cr.extensionApproved = true;
        cr.extensionDeadline = newDeadline;

        emit ExtensionApproved(circleId, periodIndex, contributor, newDeadline);
    }

    function getPayoutOrder(uint256 circleId) external view returns (address[] memory) {
        return circles[circleId].payoutOrder;
    }

    function getPeriod(
        uint256 circleId,
        uint256 periodIndex
    )
        external
        view
        returns (
            address recipient,
            uint256 deadline,
            uint256 grossEntitlement,
            bool payoutReleased,
            bool payoutWithheld,
            uint256 withheldAmount,
            address[] memory participants
        )
    {
        Period storage p = _periods[circleId][periodIndex];
        return (
            p.recipient,
            p.deadline,
            p.grossEntitlement,
            p.payoutReleased,
            p.payoutWithheld,
            p.withheldAmount,
            p.participants
        );
    }

    function getContribution(
        uint256 circleId,
        uint256 periodIndex,
        address contributor
    ) external view returns (ContributionRecord memory) {
        return _periods[circleId][periodIndex].contributions[contributor];
    }

    function _requireCircle(uint256 circleId) internal view returns (Circle storage c) {
        c = circles[circleId];
        require(c.circleId != 0, "circle not found");
    }

    function _allApproved(uint256 circleId) internal view returns (bool) {
        Circle storage c = circles[circleId];
        for (uint256 i = 0; i < c.payoutOrder.length; i++) {
            address member = c.payoutOrder[i];
            MemberRecord storage mr = memberRecords[circleId][member];
            if (!(mr.joined && mr.approved)) {
                return false;
            }
        }
        return true;
    }

    function _initializePeriod(uint256 circleId, uint256 periodIndex) internal {
        Circle storage c = circles[circleId];
        Period storage p = _periods[circleId][periodIndex];
        if (p.initialized) return;

        p.initialized = true;
        p.recipient = c.payoutOrder[periodIndex];
        p.deadline = _periodDeadline(c.startTime, c.frequency, c.weekday, c.anchorDay, uint8(periodIndex));
        p.grossEntitlement = c.contributionAmount * (uint256(c.memberCount) - 1);

        for (uint256 i = 0; i < c.payoutOrder.length; i++) {
            p.participants.push(c.payoutOrder[i]);
        }
    }

    function _isPeriodContributor(uint256 circleId, uint256 periodIndex, address account) internal view returns (bool) {
        Period storage p = _periods[circleId][periodIndex];
        if (account == p.recipient) return false;
        for (uint256 i = 0; i < p.participants.length; i++) {
            if (p.participants[i] == account) return true;
        }
        return false;
    }

    function _finalDeadline(
        uint256 baseDeadline,
        bool extensionApproved,
        uint256 extensionDeadline,
        uint256 gracePeriod
    ) internal pure returns (uint256) {
        uint256 effective = extensionApproved ? extensionDeadline : baseDeadline;
        return effective + gracePeriod;
    }

    function _finalDeadlineForCurrentPeriod(uint256 circleId) internal view returns (uint256) {
        Circle storage c = circles[circleId];
        Period storage p = _periods[circleId][c.currentPeriod];
        if (!p.initialized) return 0;

        uint256 latestFinalDeadline = p.deadline + c.gracePeriod;
        for (uint256 i = 0; i < p.participants.length; i++) {
            address member = p.participants[i];
            if (member == p.recipient) continue;

            ContributionRecord storage cr = p.contributions[member];
            uint256 memberFinalDeadline = _finalDeadline(
                p.deadline,
                cr.extensionApproved,
                cr.extensionDeadline,
                c.gracePeriod
            );
            if (memberFinalDeadline > latestFinalDeadline) {
                latestFinalDeadline = memberFinalDeadline;
            }
        }

        return latestFinalDeadline;
    }

    function _periodDeadline(
        uint256 startTime,
        Frequency frequency,
        uint8 weekday,
        uint8 anchorDay,
        uint8 periodIndex
    ) internal pure returns (uint256) {
        if (periodIndex == 0) return startTime;

        if (frequency == Frequency.WEEKLY) {
            return _nextWeekday(startTime + uint256(periodIndex) * 7 days, weekday);
        }

        return _monthlyDeadline(startTime, anchorDay, periodIndex);
    }

    function _nextWeekday(uint256 fromTimestamp, uint8 targetWeekday) internal pure returns (uint256) {
        require(targetWeekday <= 6, "invalid weekday");
        // slither-disable-next-line divide-before-multiply
        uint256 dayNumber = fromTimestamp / 1 days;
        uint256 dayStart = dayNumber * 1 days;
        uint256 currentWeekday = (dayNumber + 3) % 7;
        uint256 dayDelta = (uint256(targetWeekday) + 7 - currentWeekday) % 7;
        return dayStart + dayDelta * 1 days;
    }

    function _monthlyDeadline(
        uint256 startTime,
        uint8 anchorDay,
        uint8 periodIndex
    ) internal pure returns (uint256) {
        if (periodIndex == 0) return startTime;

        (uint256 year, uint256 month, ) = _timestampToDate(startTime);
        uint256 timeOfDay = startTime % 1 days;

        uint256 monthIndex = (month - 1) + uint256(periodIndex);
        uint256 targetYear = year + (monthIndex / 12);
        uint256 targetMonth = (monthIndex % 12) + 1;

        uint256 lastDay = _daysInMonth(targetYear, targetMonth);
        uint256 targetDay = anchorDay;
        if (targetDay > lastDay) targetDay = lastDay;

        uint256 daysSinceEpoch = _daysFromDate(targetYear, targetMonth, targetDay);
        return (daysSinceEpoch * 1 days) + timeOfDay;
    }

    function _timestampToDate(uint256 timestamp) internal pure returns (uint256 year, uint256 month, uint256 day) {
        return _daysToDate(timestamp / 1 days);
    }

    function _daysInMonth(uint256 year, uint256 month) internal pure returns (uint256) {
        if (
            month == 1 ||
            month == 3 ||
            month == 5 ||
            month == 7 ||
            month == 8 ||
            month == 10 ||
            month == 12
        ) {
            return 31;
        }
        if (month == 4 || month == 6 || month == 9 || month == 11) {
            return 30;
        }
        return _isLeapYear(year) ? 29 : 28;
    }

    function _isLeapYear(uint256 year) internal pure returns (bool) {
        return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    }

    function _daysFromDate(uint256 year, uint256 month, uint256 day) internal pure returns (uint256 _days) {
        require(year >= 1970, "year < 1970");

        int256 _year = int256(year);
        int256 _month = int256(month);
        int256 _day = int256(day);

        // slither-disable-next-line divide-before-multiply
        int256 __days =
            _day -
            32075 +
            (1461 * (_year + 4800 + (_month - 14) / 12)) /
            4 +
            (367 * (_month - 2 - ((_month - 14) / 12) * 12)) /
            12 -
            (3 * ((_year + 4900 + (_month - 14) / 12) / 100)) /
            4 -
            2440588;

        _days = uint256(__days);
    }

    function _daysToDate(uint256 _days) internal pure returns (uint256 year, uint256 month, uint256 day) {
        int256 __days = int256(_days);

        int256 L = __days + 68569 + 2440588;
        // slither-disable-next-line divide-before-multiply
        int256 N = (4 * L) / 146097;
        L = L - (146097 * N + 3) / 4;
        // slither-disable-next-line divide-before-multiply
        int256 _year = (4000 * (L + 1)) / 1461001;
        L = L - (1461 * _year) / 4 + 31;
        // slither-disable-next-line divide-before-multiply
        int256 _month = (80 * L) / 2447;
        int256 _day = L - (2447 * _month) / 80;
        // slither-disable-next-line divide-before-multiply,write-after-write
        L = _month / 11;
        _month = _month + 2 - 12 * L;
        _year = 100 * (N - 49) + _year + L;

        year = uint256(_year);
        month = uint256(_month);
        day = uint256(_day);
    }
}
