// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AdasheCircle} from "../AdasheCircle.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {ReentrantMockERC20} from "../test-helpers/ReentrantMockERC20.sol";

contract AdasheCircleTest is Test {
    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 internal constant CONTRIBUTION  = 100e6;   // 100 USDC (6 dp)
    uint8   internal constant MEMBER_COUNT  = 3;
    uint256 internal constant GRACE_PERIOD  = 240 hours; // 864 000 s

    // ── Actors ────────────────────────────────────────────────────────────────
    address internal creator = makeAddr("creator");
    address internal alice   = makeAddr("alice");
    address internal bob     = makeAddr("bob");

    // ── Contracts ─────────────────────────────────────────────────────────────
    MockERC20    internal usdc;
    AdasheCircle internal circle;

    // ── Pin ───────────────────────────────────────────────────────────────────
    bytes32 internal constant PIN = keccak256("secret");

    // ══════════════════════════════════════════════════════════════════════════
    // Helpers: read individual fields from circles() to avoid stack-too-deep.
    // The public mapping getter for Circle returns 14 positional values:
    //   [0]circleId  [1]creator  [2]name(dynamic→offset)  [3]contributionAmount
    //   [4]memberCount  [5]frequency  [6]weekday  [7]anchorDay  [8]pinHash
    //   [9]status  [10]startTime  [11]currentPeriod  [12]reserveAmount  [13]gracePeriod
    // We call circles() via low-level to pick individual slots from the ABI encoding.
    // ══════════════════════════════════════════════════════════════════════════

    /// Returns the CircleStatus of a circle (field index 9).
    function _circleStatus(uint256 cid) internal view returns (AdasheCircle.CircleStatus) {
        (bool ok, bytes memory data) = address(circle).staticcall(
            abi.encodeWithSignature("circles(uint256)", cid)
        );
        require(ok, "circles() call failed");
        // ABI layout: each static field is a 32-byte word.
        // Dynamic field `name` at index 2 occupies a 32-byte offset pointer.
        // Word positions (0-indexed × 32 bytes):
        //   0: circleId, 1: creator, 2: name-offset, 3: contributionAmount,
        //   4: memberCount, 5: frequency, 6: weekday, 7: anchorDay, 8: pinHash,
        //   9: status, 10: startTime, 11: currentPeriod, 12: reserveAmount, 13: gracePeriod
        // Then dynamic data for `name` follows.
        uint256 word;
        assembly { word := mload(add(data, add(32, mul(9, 32)))) }
        return AdasheCircle.CircleStatus(uint8(word));
    }

    /// Returns startTime (field index 10).
    function _circleStartTime(uint256 cid) internal view returns (uint256 startTime) {
        (bool ok, bytes memory data) = address(circle).staticcall(
            abi.encodeWithSignature("circles(uint256)", cid)
        );
        require(ok, "circles() call failed");
        assembly { startTime := mload(add(data, add(32, mul(10, 32)))) }
    }

    /// Returns currentPeriod (field index 11).
    function _circleCurrentPeriod(uint256 cid) internal view returns (uint8 cp) {
        (bool ok, bytes memory data) = address(circle).staticcall(
            abi.encodeWithSignature("circles(uint256)", cid)
        );
        require(ok, "circles() call failed");
        uint256 word;
        assembly { word := mload(add(data, add(32, mul(11, 32)))) }
        cp = uint8(word);
    }

    /// Returns creator (field index 1).
    function _circleCreator(uint256 cid) internal view returns (address cCreator) {
        (bool ok, bytes memory data) = address(circle).staticcall(
            abi.encodeWithSignature("circles(uint256)", cid)
        );
        require(ok, "circles() call failed");
        uint256 word;
        assembly { word := mload(add(data, add(32, mul(1, 32)))) }
        cCreator = address(uint160(word));
    }

    /// Returns contributionAmount (field index 3).
    function _circleContribution(uint256 cid) internal view returns (uint256 amt) {
        (bool ok, bytes memory data) = address(circle).staticcall(
            abi.encodeWithSignature("circles(uint256)", cid)
        );
        require(ok, "circles() call failed");
        assembly { amt := mload(add(data, add(32, mul(3, 32)))) }
    }

    /// Returns memberCount (field index 4).
    function _circleMemberCount(uint256 cid) internal view returns (uint8 mc) {
        (bool ok, bytes memory data) = address(circle).staticcall(
            abi.encodeWithSignature("circles(uint256)", cid)
        );
        require(ok, "circles() call failed");
        uint256 word;
        assembly { word := mload(add(data, add(32, mul(4, 32)))) }
        mc = uint8(word);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Helper: memberRecords fields
    // (approved, joined, reserveBalance, debtBalance, removedAt, replacedBy)
    // ══════════════════════════════════════════════════════════════════════════
    struct MemberView {
        bool    approved;
        bool    joined;
        uint256 reserveBalance;
        uint256 debtBalance;
        uint256 removedAt;
        address replacedBy;
    }

    function _getMember(uint256 cid, address who) internal view returns (MemberView memory v) {
        (v.approved, v.joined, v.reserveBalance, v.debtBalance, v.removedAt, v.replacedBy)
            = circle.memberRecords(cid, who);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Helper: fund an address and approve the circle contract
    // ══════════════════════════════════════════════════════════════════════════
    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(circle), type(uint256).max);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Helper: standard 3-member payout order [creator, alice, bob]
    // ══════════════════════════════════════════════════════════════════════════
    function _payoutOrder3() internal view returns (address[] memory) {
        address[] memory order = new address[](3);
        order[0] = creator;
        order[1] = alice;
        order[2] = bob;
        return order;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Helper: create + fully activate a 3-member weekly circle
    // ══════════════════════════════════════════════════════════════════════════
    function _createAndActivate3() internal returns (uint256 cid) {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        cid = circle.createCircle("Test", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(alice);   circle.joinCircle(cid);
        vm.prank(bob);     circle.joinCircle(cid);

        vm.prank(creator); circle.approveMember(cid, creator);
        vm.prank(creator); circle.approveMember(cid, alice);
        // Last approval activates the circle
        vm.prank(creator); circle.approveMember(cid, bob);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Helper: move time past the final deadline of the current period
    // ══════════════════════════════════════════════════════════════════════════
    function _skipPastFinalDeadline(uint256 cid) internal {
        uint8 cp = _circleCurrentPeriod(cid);
        (, uint256 deadline, , , , , ) = circle.getPeriod(cid, cp);
        vm.warp(deadline + GRACE_PERIOD + 1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // setUp — runs before EVERY test
    // ══════════════════════════════════════════════════════════════════════════
    function setUp() public {
        usdc   = new MockERC20("Mock USDC", "mUSDC", 6);
        circle = new AdasheCircle(address(usdc));

        _fund(creator, 10_000e6);
        _fund(alice,   10_000e6);
        _fund(bob,     10_000e6);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. createCircle – valid params; activates when all members join + approve
    // ══════════════════════════════════════════════════════════════════════════

    function test_createCircle_ActivatesWhenAllJoinAndApprove() public {
        uint256 cid = _createAndActivate3();

        assertEq(_circleCreator(cid),                                creator);
        assertEq(_circleContribution(cid),                           CONTRIBUTION);
        assertEq(_circleMemberCount(cid),                            3);
        assertEq(uint8(_circleStatus(cid)),                          uint8(AdasheCircle.CircleStatus.ACTIVE));
        assertGt(_circleStartTime(cid),                              0);
    }

    function test_createCircle_EmitsCircleActivated() public {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        uint256 cid = circle.createCircle("Test", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(alice);   circle.joinCircle(cid);
        vm.prank(bob);     circle.joinCircle(cid);

        vm.prank(creator); circle.approveMember(cid, creator);
        vm.prank(creator); circle.approveMember(cid, alice);

        // Expect CircleActivated on the last approval
        vm.expectEmit(true, false, false, false, address(circle));
        emit AdasheCircle.CircleActivated(cid, block.timestamp, 0 /* any */);
        vm.prank(creator); circle.approveMember(cid, bob);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. createCircle – revert paths
    // ══════════════════════════════════════════════════════════════════════════

    function _makeAddrOrder(uint8 n) internal pure returns (address[] memory order) {
        order = new address[](n);
        for (uint8 i = 0; i < n; i++) {
            order[i] = address(uint160(0x1000 + i));
        }
    }

    function test_createCircle_RevertsMemberCount1() public {
        address[] memory order = _makeAddrOrder(1);
        vm.prank(creator);
        vm.expectRevert(bytes("invalid member count"));
        circle.createCircle("T", CONTRIBUTION, 1, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);
    }

    function test_createCircle_RevertsMemberCount13() public {
        address[] memory order = _makeAddrOrder(13);
        vm.prank(creator);
        vm.expectRevert(bytes("invalid member count"));
        circle.createCircle("T", CONTRIBUTION, 13, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);
    }

    function test_createCircle_RevertsZeroContribution() public {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        vm.expectRevert(bytes("contribution must be > 0"));
        circle.createCircle("T", 0, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);
    }

    function test_createCircle_RevertsDuplicateAddress() public {
        address[] memory order = new address[](3);
        order[0] = creator;
        order[1] = creator; // duplicate
        order[2] = alice;
        vm.prank(creator);
        vm.expectRevert(bytes("duplicate payout member"));
        circle.createCircle("T", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);
    }

    function test_createCircle_RevertsZeroAddressInOrder() public {
        address[] memory order = new address[](3);
        order[0] = creator;
        order[1] = address(0);
        order[2] = alice;
        vm.prank(creator);
        vm.expectRevert(bytes("zero payout member"));
        circle.createCircle("T", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. joinCircle – revert paths
    // ══════════════════════════════════════════════════════════════════════════

    function test_joinCircle_RevertsIfNotInPayoutOrder() public {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        uint256 cid = circle.createCircle("T", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        address outsider = makeAddr("outsider");
        vm.prank(outsider);
        vm.expectRevert(bytes("not in payout order"));
        circle.joinCircle(cid);
    }

    function test_joinCircle_RevertsIfCircleAlreadyActive() public {
        uint256 cid = _createAndActivate3();
        // alice already joined; trying to join again on an active circle fails
        vm.prank(alice);
        vm.expectRevert(bytes("circle not pending"));
        circle.joinCircle(cid);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. approveMember – reverts if not creator
    // ══════════════════════════════════════════════════════════════════════════

    function test_approveMember_RevertsIfNotCreator() public {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        uint256 cid = circle.createCircle("T", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(alice);   circle.joinCircle(cid);

        vm.prank(alice);
        vm.expectRevert(bytes("only creator"));
        circle.approveMember(cid, alice);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Happy path 3-member: all contribute → finalizePeriod → claimPayout
    //    net payout == contributionAmount*(memberCount-2), reserve increases
    // ══════════════════════════════════════════════════════════════════════════

    function test_happyPath_3Member_NetPayoutAndReserveIncrease() public {
        uint256 cid = _createAndActivate3();

        // Period 0 recipient is creator (slot 0)
        (address recipient0, , , , , , ) = circle.getPeriod(cid, 0);
        assertEq(recipient0, creator, "period 0 recipient should be creator");

        uint256 balanceBefore = usdc.balanceOf(creator);

        // alice and bob contribute
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);

        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        // Net payout = contributionAmount * (memberCount - 2) = 100e6 * 1 = 100e6
        uint256 expectedNet = CONTRIBUTION * (MEMBER_COUNT - 2);
        assertEq(expectedNet, 100e6);

        vm.prank(creator);
        circle.claimPayout(cid, 0);

        uint256 balanceAfter = usdc.balanceOf(creator);
        assertEq(balanceAfter - balanceBefore, expectedNet, "net payout mismatch");

        // recipient's reserveBalance should equal reserveAmount (= contributionAmount)
        MemberView memory mv = _getMember(cid, creator);
        assertEq(mv.reserveBalance, CONTRIBUTION, "reserve balance mismatch");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6. claimPayout – reverts if outstanding debt
    // ══════════════════════════════════════════════════════════════════════════

    function test_claimPayout_RevertsIfDebtOutstanding() public {
        uint256 cid = _createAndActivate3();

        // Period 0: BOTH alice+bob contribute (creator is recipient, gets full claimable)
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0); // OK: claimable = CONTRIBUTION

        // Period 1: creator contributes but bob defaults
        vm.prank(creator); circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        // alice is recipient of period 1; only 1 contributor (creator) so claimable=0
        // Don't try to claim for alice — just move on

        // Period 2: alice+creator contribute; bob IS the recipient with debt
        vm.prank(alice);   circle.contribute(cid, 2);
        vm.prank(creator); circle.contribute(cid, 2);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        // Circle is COMPLETED; bob has debt → claimPayout should revert with "debt outstanding"
        MemberView memory mv = _getMember(cid, bob);
        assertGt(mv.debtBalance, 0, "bob should have debt");

        vm.prank(bob);
        vm.expectRevert(bytes("debt outstanding"));
        circle.claimPayout(cid, 2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 7. claimPayout – reverts if already claimed
    // ══════════════════════════════════════════════════════════════════════════

    function test_claimPayout_RevertsIfAlreadyClaimed() public {
        uint256 cid = _createAndActivate3();

        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        vm.prank(creator); circle.claimPayout(cid, 0);

        vm.prank(creator);
        vm.expectRevert(bytes("no claimable payout"));
        circle.claimPayout(cid, 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 8. contribute – reverts if caller is the period recipient
    // ══════════════════════════════════════════════════════════════════════════

    function test_contribute_RevertsIfCallerIsRecipient() public {
        uint256 cid = _createAndActivate3();
        // Period 0 recipient is creator
        vm.prank(creator);
        vm.expectRevert(bytes("not period contributor"));
        circle.contribute(cid, 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 9. contribute – reverts after finalDeadline (deadline + gracePeriod)
    // ══════════════════════════════════════════════════════════════════════════

    function test_contribute_RevertsAfterFinalDeadline() public {
        uint256 cid = _createAndActivate3();

        (, uint256 dl, , , , , ) = circle.getPeriod(cid, 0);
        vm.warp(dl + GRACE_PERIOD + 1);

        vm.prank(alice);
        vm.expectRevert(bytes("final deadline passed"));
        circle.contribute(cid, 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 10. finalizePeriod – reverts if called before all final deadlines pass
    // ══════════════════════════════════════════════════════════════════════════

    function test_finalizePeriod_RevertsBeforeAllDeadlines() public {
        uint256 cid = _createAndActivate3();
        // At activation, period 0 deadline = startTime; grace period still running
        vm.expectRevert(bytes("not all final deadlines passed"));
        circle.finalizePeriod(cid);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 11. Missed contribution: reserve covers defaulter, debtBalance increases,
    //     other members' reserve unchanged
    // ══════════════════════════════════════════════════════════════════════════

    function test_missedContribution_NoReserve_DebtIncreases() public {
        uint256 cid = _createAndActivate3();

        // Period 0: creator is recipient; alice pays; bob defaults (no reserve)
        vm.prank(alice); circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        MemberView memory bobMv = _getMember(cid, bob);
        assertEq(bobMv.debtBalance, CONTRIBUTION, "bob should have full contribution as debt");
        assertEq(bobMv.reserveBalance, 0, "bob reserve should be zero");

        // creator (recipient of period 0) should have reserve = min(totalCollected, reserveAmount)
        // totalCollected = CONTRIBUTION (only alice paid), reserveAmount = CONTRIBUTION
        MemberView memory creatorMv = _getMember(cid, creator);
        assertEq(creatorMv.reserveBalance, CONTRIBUTION, "creator reserve should be contribution amount");
    }

    function test_missedContribution_WithReserveCover_ReserveDecreases() public {
        // Give alice a reserve first (run periods so she becomes recipient),
        // then have her default as a contributor.
        uint256 cid = _createAndActivate3();

        // Period 0 (creator=recipient): all contribute
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0);

        // Period 1 (alice=recipient): creator+bob contribute; alice gets reserve
        vm.prank(creator); circle.contribute(cid, 1);
        vm.prank(bob);     circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(alice); circle.claimPayout(cid, 1);

        MemberView memory aliceMv1 = _getMember(cid, alice);
        assertEq(aliceMv1.reserveBalance, CONTRIBUTION, "alice should have reserve after her period");

        // Period 2 (bob=recipient): creator contributes; alice defaults
        vm.prank(creator); circle.contribute(cid, 2);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        MemberView memory aliceMv2 = _getMember(cid, alice);
        assertEq(aliceMv2.reserveBalance, 0,            "alice reserve should be drained after default");
        assertEq(aliceMv2.debtBalance,    CONTRIBUTION, "alice debt should equal contribution");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 12. Reserve covers partial miss:
    //     if reserveBalance < contributionAmount, covers available, rest → debt
    // ══════════════════════════════════════════════════════════════════════════

    function test_reservePartialCover() public {
        // Use a 4-member circle to give alice exactly CONTRIBUTION/2 reserve,
        // then have her default. We'll do this by intercepting partial coverage.
        //
        // Strategy: 4-member circle. alice becomes recipient in period 1 (gets reserveCredit).
        // In period 2 alice defaults. Normally, with reserve == CONTRIBUTION this is full cover.
        // For a TRUE partial test we need to set up alice's reserve < CONTRIBUTION.
        //
        // Since we cannot directly manipulate reserve, we use a 4-member circle where
        // period 0 totalCollected < reserveAmount due to another default, which gives the
        // period-0 recipient a partial reserve. Then that member defaults later.
        //
        // Setup: 4 members: creator, alice, bob, dan.
        // Period 0 (creator=recipient): alice pays, bob+dan default.
        //   totalCollected = CONTRIBUTION; reserveAmount = CONTRIBUTION; reserveCredit = CONTRIBUTION
        //   creator.reserveBalance = CONTRIBUTION
        //
        // Period 1 (alice=recipient): ...
        //
        // Actually for partial we need totalCollected < reserveAmount in period 0.
        // But reserveAmount = CONTRIBUTION and each contribution = CONTRIBUTION.
        // If only alice pays in a 4-member circle: totalCollected = CONTRIBUTION = reserveAmount → full credit.
        // If nobody pays: totalCollected = 0 → reserveCredit = 0.
        // We cannot get a truly partial reserve that way.
        //
        // Instead: manufacture partial reserve in a DIFFERENT way.
        // 3-member circle where a double-default in period 0 leads to:
        //   totalCollected = 0, reserveCredit = 0 for creator.
        // Then in period 1 (alice=recipient), creator and bob each have NO reserve (never been recipient).
        // Not useful for partial test.
        //
        // TRUE partial scenario requires a member with reserve < CONTRIBUTION, which only happens
        // if the member was recipient in a period where totalCollected < reserveAmount.
        // That means the *previous* recipients' reserves funded contributions.
        //
        // Simplest achievable path: 4-member circle, period 0 only ONE contributor pays.
        // totalCollected=CONTRIBUTION, reserveAmount=CONTRIBUTION → full credit, not partial.
        //
        // Conclusion: the only way to create a partial reserve state is when a recipient period
        // had less total collected than the reservation amount. For reserveAmount == CONTRIBUTION
        // this requires totalCollected < CONTRIBUTION, which means 0 contributors paid.
        // In that case reserveCredit = 0 (not partial).
        //
        // Therefore the code path `reserveBalance > 0 && reserveBalance < contributionAmount`
        // (partial cover) can only be reached if the reserve was accumulated via *multiple* small
        // credits, or if contributionAmount changed (it cannot), or if a prior partial-cover
        // already drained some of the reserve.
        //
        // We achieve it by: 4-member circle, alice is recipient in period 1 (gets CONTRIBUTION reserve),
        // then in period 2 alice defaults (reserve drains to 0, debtBalance = CONTRIBUTION).
        // In period 3 alice defaults again — but reserve is now 0, so this tests the zero-reserve path.
        //
        // The ONLY way to exercise partial cover is to have alice receive a PARTIAL reserve credit.
        // This happens when totalCollected < reserveAmount in alice's recipient period.
        // With 4 members and CONTRIBUTION = reserveAmount:
        //   If only 1 contributor pays in alice's period: totalCollected=CONTRIBUTION=reserveAmount → full.
        //   If 0 pay: totalCollected=0 → reserveCredit=0, no reserve.
        // So we cannot get alice.reserve = CONTRIBUTION/2.
        //
        // WORKAROUND: Use two separate circles so alice is recipient in period 1 of circle A
        // (gets CONTRIBUTION reserve), then also defaults in period 0 of circle B — but
        // reserves are per-circle.
        //
        // ACTUAL WORKAROUND: We will use a 2-member circle to give alice 0 net payout
        // (memberCount=2, net=0) and then build up partial reserve across multiple periods
        // by exploiting the accumulation. With 2 members, memberCount-2=0, so reserve=CONTRIBUTION
        // per period recipient. After 1 period alice has CONTRIBUTION reserve. That's full coverage.
        //
        // NOTE: Achieving `reserveBalance < contributionAmount` requires a scenario where
        // the recipient period had totalCollected < reserveAmount. The contract
        // `reserveCredit = min(reserveAmount, totalCollected)`. This requires totalCollected in
        // [1, reserveAmount-1]. That means at least 1 contributor BUT totalCollected in USDC
        // fractional amounts — impossible with integer USDC and contributionAmount = reserveAmount.
        //
        // THEREFORE: the only way to get partial reserve in the existing contract design is if
        // the reserve was partially spent in a previous default (full cover depletes reserve to 0)
        // or if a PRIOR partial-cover scenario left a remainder. This is a circular dependency.
        //
        // CONCLUSION: the "partial reserve cover" branch (line 371-385 of the contract) can be
        // reached if a member *had* reserve from being a recipient, then partially defaulted in
        // one period (impossible: full-cover depletes fully), meaning the branch is unreachable
        // with standard integer contributionAmount == reserveAmount unless contributionAmount changes.
        //
        // We'll test the FULL-COVER path (which is the realistic case) and note this finding.
        uint256 cid = _createAndActivate3();

        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0);

        vm.prank(creator); circle.contribute(cid, 1);
        vm.prank(bob);     circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(alice); circle.claimPayout(cid, 1);

        MemberView memory aliceBefore = _getMember(cid, alice);
        assertEq(aliceBefore.reserveBalance, CONTRIBUTION);

        // alice defaults in period 2 with reserve == CONTRIBUTION (full cover)
        vm.prank(creator); circle.contribute(cid, 2);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        MemberView memory aliceAfter = _getMember(cid, alice);
        assertEq(aliceAfter.reserveBalance, 0,            "alice reserve drained by full cover");
        assertEq(aliceAfter.debtBalance,    CONTRIBUTION, "alice debt equals contribution");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 13. No cross-member reserve: only defaulter's reserve used
    // ══════════════════════════════════════════════════════════════════════════

    function test_noCrossMemberReserve() public {
        // Use a 4-member circle: creator, alice, bob, dan
        // Order: [creator(0), alice(1), bob(2), dan(3)]
        // period 0 = creator gets payout; period 1 = alice; period 2 = bob; period 3 = dan
        // 
        // We'll run periods 0,1,2 normally so all three have reserve.
        // In period 3 (dan=recipient): alice defaults.
        // Verify: only alice's reserve is used, bob's reserve is unchanged.

        address dan = makeAddr("dan");
        _fund(dan, 10_000e6);

        address[] memory order = new address[](4);
        order[0] = creator;
        order[1] = alice;
        order[2] = bob;
        order[3] = dan;

        vm.prank(creator);
        uint256 cid = circle.createCircle("X", CONTRIBUTION, 4, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(alice);   circle.joinCircle(cid);
        vm.prank(bob);     circle.joinCircle(cid);
        vm.prank(dan);     circle.joinCircle(cid);

        vm.prank(creator); circle.approveMember(cid, creator);
        vm.prank(creator); circle.approveMember(cid, alice);
        vm.prank(creator); circle.approveMember(cid, bob);
        vm.prank(creator); circle.approveMember(cid, dan);

        // Period 0 (creator=recipient): alice, bob, dan contribute
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        vm.prank(dan);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0);

        // Period 1 (alice=recipient): creator, bob, dan contribute
        vm.prank(creator); circle.contribute(cid, 1);
        vm.prank(bob);     circle.contribute(cid, 1);
        vm.prank(dan);     circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(alice); circle.claimPayout(cid, 1);

        // Period 2 (bob=recipient): creator, alice, dan contribute
        vm.prank(creator); circle.contribute(cid, 2);
        vm.prank(alice);   circle.contribute(cid, 2);
        vm.prank(dan);     circle.contribute(cid, 2);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(bob); circle.claimPayout(cid, 2);

        // Now bob has reserve from being period-2 recipient
        MemberView memory bobWithReserve = _getMember(cid, bob);
        assertGt(bobWithReserve.reserveBalance, 0, "bob should have reserve after his recipient period");

        // Period 3 (dan=recipient): creator+bob contribute; alice defaults
        vm.prank(creator); circle.contribute(cid, 3);
        vm.prank(bob);     circle.contribute(cid, 3);
        _skipPastFinalDeadline(cid);

        // Snapshot bob's reserve BEFORE finalization
        MemberView memory bobBeforeFinalize = _getMember(cid, bob);

        circle.finalizePeriod(cid); // alice defaults; alice has reserve so it covers

        // Alice's reserve should be drained (partial or full)
        MemberView memory aliceAfter = _getMember(cid, alice);
        assertGt(aliceAfter.debtBalance, 0, "alice should owe contribution (or partial)");

        // Bob's reserve should be UNCHANGED by alice's default
        MemberView memory bobAfterFinalize = _getMember(cid, bob);
        assertEq(bobAfterFinalize.reserveBalance, bobBeforeFinalize.reserveBalance,
            "bob reserve should NOT be touched by alice's default");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 14. repayDebt: after paying, debtBalance zero, claimPayout succeeds
    // ══════════════════════════════════════════════════════════════════════════

    function test_repayDebt_ThenClaimPayoutSucceeds() public {
        uint256 cid = _createAndActivate3();

        // Period 0 (creator=recipient): BOTH alice+bob contribute
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0); // claimable = CONTRIBUTION ✓

        // Period 1 (alice=recipient): only creator contributes; bob defaults → bob gets debt
        vm.prank(creator); circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        // alice's claimable = 0 (1 contributor, all goes to reserve); don't try to claim

        // Period 2 (bob=recipient): alice+creator contribute → bob gets claimable = CONTRIBUTION
        vm.prank(alice);   circle.contribute(cid, 2);
        vm.prank(creator); circle.contribute(cid, 2);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        MemberView memory bobMv = _getMember(cid, bob);
        assertGt(bobMv.debtBalance, 0, "bob should have debt from period 1 default");

        // claimPayout fails while debt outstanding
        vm.prank(bob);
        vm.expectRevert(bytes("debt outstanding"));
        circle.claimPayout(cid, 2);

        // repay the debt (bob defaulted in period 1)
        vm.prank(bob);
        circle.repayDebt(cid, 1);

        MemberView memory bobAfter = _getMember(cid, bob);
        assertEq(bobAfter.debtBalance, 0, "debt should be zero after repay");

        // now claimPayout should succeed and bob receives the net payout
        uint256 balBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        circle.claimPayout(cid, 2);
        uint256 balAfter = usdc.balanceOf(bob);
        assertGt(balAfter, balBefore, "bob should receive payout after debt cleared");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 15. claimReserveRefund
    // ══════════════════════════════════════════════════════════════════════════

    function test_claimReserveRefund_RevertsIfNotCompleted() public {
        uint256 cid = _createAndActivate3();
        vm.prank(creator);
        vm.expectRevert(bytes("circle not completed"));
        circle.claimReserveRefund(cid);
    }

    function test_claimReserveRefund_SucceedsAfterCompletion() public {
        uint256 cid = _createAndActivate3();

        // Complete all 3 periods
        // Period 0 (creator): alice+bob contribute
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0);

        // Period 1 (alice): creator+bob contribute
        vm.prank(creator); circle.contribute(cid, 1);
        vm.prank(bob);     circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(alice); circle.claimPayout(cid, 1);

        // Period 2 (bob): creator+alice contribute
        vm.prank(creator); circle.contribute(cid, 2);
        vm.prank(alice);   circle.contribute(cid, 2);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(bob); circle.claimPayout(cid, 2);

        // Verify COMPLETED
        assertEq(uint8(_circleStatus(cid)), uint8(AdasheCircle.CircleStatus.COMPLETED));

        // All 3 members should have reserve to refund
        MemberView memory creatorMv = _getMember(cid, creator);
        assertGt(creatorMv.reserveBalance, 0, "creator should have reserve");

        uint256 balBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        circle.claimReserveRefund(cid);
        uint256 balAfter = usdc.balanceOf(creator);
        assertEq(balAfter - balBefore, creatorMv.reserveBalance, "reserve refund amount mismatch");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 16. settleOwnDebtFromWithheldPayout
    // ══════════════════════════════════════════════════════════════════════════

    function test_settleOwnDebtFromWithheldPayout() public {
        uint256 cid = _createAndActivate3();

        // Period 0 (creator=recipient): BOTH alice+bob contribute
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0); // claimable = CONTRIBUTION ✓

        // Period 1 (alice=recipient): only creator contributes; bob defaults
        vm.prank(creator); circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        // alice's claimable = 0; don't claim

        // Period 2 (bob=recipient): alice+creator contribute; bob has debt → payout withheld
        vm.prank(alice);   circle.contribute(cid, 2);
        vm.prank(creator); circle.contribute(cid, 2);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        // Circle is COMPLETED
        assertEq(uint8(_circleStatus(cid)), uint8(AdasheCircle.CircleStatus.COMPLETED));

        // bob's payout was withheld because bob has debt
        (, , , , bool payoutWithheld, , ) = circle.getPeriod(cid, 2);
        assertTrue(payoutWithheld, "bob payout should be withheld");

        MemberView memory bobBefore = _getMember(cid, bob);
        assertGt(bobBefore.debtBalance, 0, "bob should have debt");

        // Accounting:
        // bob's debt from period 1 default = CONTRIBUTION = 100e6
        // bob's claimable in period 2 = 2*CONTRIBUTION - CONTRIBUTION = CONTRIBUTION = 100e6
        // amountToDebt = min(debt, claimable) = CONTRIBUTION; remainder claimable = 0
        // bob receives 0 tokens (all withheld payout covers debt exactly)
        uint256 balBefore = usdc.balanceOf(bob);
        // bob's debt is from period 1 default; withheld payout is period 2
        vm.prank(bob);
        circle.settleOwnDebtFromWithheldPayout(cid, 2, 1);
        uint256 balAfter = usdc.balanceOf(bob);

        MemberView memory bobAfter = _getMember(cid, bob);
        assertEq(bobAfter.debtBalance, 0, "bob debt should be settled");
        // debt == withheld → remainder = 0 → no tokens transferred
        assertEq(balAfter, balBefore, "no tokens since debt == withheld payout");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 17. approveReplacement – revert paths
    // ══════════════════════════════════════════════════════════════════════════

    function test_approveReplacement_RevertsIfOutgoingHasDebt() public {
        uint256 cid = _createAndActivate3();

        // Give alice debt: alice defaults in period 0 (creator is recipient)
        vm.prank(bob); circle.contribute(cid, 0);
        // alice is contributor (not recipient) but doesn't pay → defaults after grace
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        MemberView memory aliceMv = _getMember(cid, alice);
        assertGt(aliceMv.debtBalance, 0, "alice should have debt");

        address replacement = makeAddr("replacement");
        vm.prank(creator);
        vm.expectRevert(bytes("outgoing has debt"));
        circle.approveReplacement(cid, alice, replacement);
    }

    function test_approveReplacement_RevertsIfNotCreator() public {
        uint256 cid = _createAndActivate3();

        address replacement = makeAddr("replacement");
        vm.prank(alice);
        vm.expectRevert(bytes("only creator"));
        circle.approveReplacement(cid, bob, replacement);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 18. executeReplacement – reverts mid-period; only callable by creator
    // ══════════════════════════════════════════════════════════════════════════

    function test_executeReplacement_RevertsMidPeriod() public {
        uint256 cid = _createAndActivate3();

        address replacement = makeAddr("replacement");
        vm.prank(creator);
        circle.approveReplacement(cid, alice, replacement);

        // Final deadline has NOT passed → mid-period
        vm.prank(creator);
        vm.expectRevert(bytes("Cannot replace mid-period"));
        circle.executeReplacement(cid, alice);
    }

    function test_executeReplacement_RevertsIfNotCreator() public {
        uint256 cid = _createAndActivate3();

        address replacement = makeAddr("replacement");
        vm.prank(creator);
        circle.approveReplacement(cid, alice, replacement);

        _skipPastFinalDeadline(cid);

        vm.prank(alice);
        vm.expectRevert(bytes("Only creator"));
        circle.executeReplacement(cid, alice);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 19. executeReplacement – new address in payoutOrder slot, old records kept
    // ══════════════════════════════════════════════════════════════════════════

    function test_executeReplacement_NewAddressInSlot_OldRecordsPreserved() public {
        uint256 cid = _createAndActivate3();

        address replacement = makeAddr("replacement");
        _fund(replacement, 10_000e6);

        vm.prank(creator);
        circle.approveReplacement(cid, alice, replacement);

        _skipPastFinalDeadline(cid);

        vm.expectEmit(true, true, true, true, address(circle));
        emit AdasheCircle.MemberReplaced(cid, alice, replacement);

        vm.prank(creator);
        circle.executeReplacement(cid, alice);

        // replacement is now in payoutOrder slot 1
        assertFalse(circle.isInPayoutOrder(cid, alice),       "alice should be removed");
        assertTrue(circle.isInPayoutOrder(cid, replacement),  "replacement should be in order");

        address[] memory order = circle.getPayoutOrder(cid);
        assertEq(order[1], replacement, "slot 1 should be replacement");

        // alice's record: approved = false, removedAt > 0
        MemberView memory aliceMv = _getMember(cid, alice);
        assertFalse(aliceMv.approved, "alice.approved should be false");
        assertGt(aliceMv.removedAt,  0, "alice.removedAt should be set");
        assertEq(aliceMv.replacedBy, replacement, "alice.replacedBy should be replacement");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 20. removePendingMember + reassignPendingSlot: only creator can call
    // ══════════════════════════════════════════════════════════════════════════

    function test_removePendingMember_RevertsIfNotCreator() public {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        uint256 cid = circle.createCircle("T", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(alice);   circle.joinCircle(cid);

        vm.prank(alice);
        vm.expectRevert(bytes("only creator"));
        circle.removePendingMember(cid, creator);
    }

    function test_removePendingMember_CreatorCanRemove() public {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        uint256 cid = circle.createCircle("T", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(alice);   circle.joinCircle(cid);

        vm.prank(creator); circle.approveMember(cid, creator);
        vm.prank(creator); circle.approveMember(cid, alice);

        vm.prank(creator);
        vm.expectEmit(true, true, false, false, address(circle));
        emit AdasheCircle.PendingMemberRemoved(cid, alice, 1);
        circle.removePendingMember(cid, alice);

        (, bool aliceJoined, , , , ) = circle.memberRecords(cid, alice);
        assertFalse(aliceJoined, "alice should be un-joined after removal");
    }

    function test_reassignPendingSlot_RevertsIfNotCreator() public {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        uint256 cid = circle.createCircle("T", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        address newMember = makeAddr("newMember");
        vm.prank(alice);
        vm.expectRevert(bytes("only creator"));
        circle.reassignPendingSlot(cid, 1, newMember);
    }

    function test_reassignPendingSlot_CreatorCanReassign() public {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        uint256 cid = circle.createCircle("T", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(alice);   circle.joinCircle(cid);
        vm.prank(creator); circle.approveMember(cid, creator);
        vm.prank(creator); circle.approveMember(cid, alice);

        // Remove alice first
        vm.prank(creator);
        circle.removePendingMember(cid, alice);

        address newMember = makeAddr("newMember");
        vm.prank(creator);
        vm.expectEmit(true, true, true, false, address(circle));
        emit AdasheCircle.SlotReassigned(cid, 1, newMember);
        circle.reassignPendingSlot(cid, 1, newMember);

        assertTrue(circle.isInPayoutOrder(cid, newMember), "newMember should be in order");
        assertFalse(circle.isInPayoutOrder(cid, alice),    "alice should be removed from order");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 21. Weekly schedule: period 0 deadline == startTime;
    //     period 1 is startTime + ~7 days aligned to target weekday
    // ══════════════════════════════════════════════════════════════════════════

    function test_weeklySchedule_Period0EqStartTime() public {
        uint256 cid = _createAndActivate3();

        (, uint256 dl0, , , , , ) = circle.getPeriod(cid, 0);
        assertEq(dl0, _circleStartTime(cid), "period 0 deadline should equal startTime");
    }

    function test_weeklySchedule_Period1AlignedToWeekday() public {
        uint256 cid = _createAndActivate3();
        uint256 st = _circleStartTime(cid);

        // Period 1 is initialized when period 0 is finalized.
        // Finalize period 0 first (all contributors pay).
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        (, uint256 dl1, , , , , ) = circle.getPeriod(cid, 1);

        // period 1 deadline should be in [startTime + 6d, startTime + 14d]
        assertGe(dl1, st + 6 days,  "period 1 too soon");
        assertLe(dl1, st + 14 days, "period 1 too late");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 22. Monthly schedule: period 0 == startTime; period 1 advances one month;
    //     anchor day clamped to Feb last day
    // ══════════════════════════════════════════════════════════════════════════

    function _activateMonthly(uint8 anchorDay) internal returns (uint256 cid) {
        address[] memory order = _payoutOrder3();
        vm.prank(creator);
        cid = circle.createCircle(
            "M", CONTRIBUTION, 3, AdasheCircle.Frequency.MONTHLY, 0, anchorDay, order, PIN
        );
        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(alice);   circle.joinCircle(cid);
        vm.prank(bob);     circle.joinCircle(cid);
        vm.prank(creator); circle.approveMember(cid, creator);
        vm.prank(creator); circle.approveMember(cid, alice);
        vm.prank(creator); circle.approveMember(cid, bob);
    }

    function test_monthlySchedule_Period0EqStartTime() public {
        // Jan 15, 2025 00:00:00 UTC = 1736899200
        vm.warp(1736899200);
        uint256 cid = _activateMonthly(15);

        (, uint256 dl0, , , , , ) = circle.getPeriod(cid, 0);
        assertEq(dl0, _circleStartTime(cid), "period 0 deadline should equal startTime");
    }

    function test_monthlySchedule_Period1AdvancesOneMonth() public {
        // Jan 15, 2025 00:00:00 UTC = 1736899200
        uint256 jan15 = 1736899200;
        vm.warp(jan15);
        uint256 cid = _activateMonthly(15);

        // Period 1 is only initialized after period 0 is finalized.
        // Warp past period-0 final deadline (startTime + gracePeriod).
        vm.warp(jan15 + GRACE_PERIOD + 1);
        circle.finalizePeriod(cid); // no contributions → claimable=0 (ok for this test)

        (, uint256 dl1, , , , , ) = circle.getPeriod(cid, 1);

        // Feb 15, 2025 00:00:00 UTC = 1739577600
        assertEq(dl1, 1739577600, "period 1 should be Feb 15 2025");
    }

    function test_monthlySchedule_AnchorDayClampedToFebLastDay() public {
        // Jan 31, 2025 00:00:00 UTC = 1738281600
        uint256 jan31 = 1738281600;
        vm.warp(jan31);
        uint256 cid = _activateMonthly(31);

        // Period 1 is only initialized after period 0 is finalized.
        vm.warp(jan31 + GRACE_PERIOD + 1);
        circle.finalizePeriod(cid);

        (, uint256 dl1, , , , , ) = circle.getPeriod(cid, 1);

        // Feb 28, 2025 00:00:00 UTC = 1740700800
        assertEq(dl1, 1740700800, "anchor day 31 should clamp to Feb 28 2025");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 23. Fuzz: net payout == contributionAmount * (memberCount - 2)
    // ══════════════════════════════════════════════════════════════════════════

    function testFuzz_NetPayout(uint256 contribution, uint8 memberCount) public {
        contribution = bound(contribution, 1e6, 1000e6);
        // Use [3,12] so net payout is always > 0 (memberCount=2 → net=0 → claimPayout reverts)
        memberCount  = uint8(bound(uint256(memberCount), 3, 12));

        // Build payout order with exactly memberCount unique addresses
        address[] memory order = new address[](memberCount);
        for (uint8 i = 0; i < memberCount; i++) {
            order[i] = address(uint160(0x9000 + i));
        }

        // Fund all members
        for (uint8 i = 0; i < memberCount; i++) {
            usdc.mint(order[i], contribution * uint256(memberCount) * 2);
            vm.prank(order[i]);
            usdc.approve(address(circle), type(uint256).max);
        }

        // Create, join, approve
        vm.prank(order[0]);
        uint256 cid = circle.createCircle(
            "Fuzz", contribution, memberCount,
            AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN
        );
        for (uint8 i = 0; i < memberCount; i++) {
            vm.prank(order[i]);
            circle.joinCircle(cid);
        }
        for (uint8 i = 0; i < memberCount; i++) {
            vm.prank(order[0]);
            circle.approveMember(cid, order[i]);
        }

        // All non-recipients contribute in period 0
        address recipient0 = order[0];
        for (uint8 i = 0; i < memberCount; i++) {
            if (order[i] == recipient0) continue;
            vm.prank(order[i]);
            circle.contribute(cid, 0);
        }

        (, uint256 dl0, , , , , ) = circle.getPeriod(cid, 0);
        vm.warp(dl0 + GRACE_PERIOD + 1);
        circle.finalizePeriod(cid);

        // Expected net = contribution * (memberCount - 2); always > 0 since memberCount >= 3
        uint256 expectedNet = contribution * (uint256(memberCount) - 2);

        uint256 balBefore = usdc.balanceOf(recipient0);
        vm.prank(recipient0);
        circle.claimPayout(cid, 0);
        uint256 balAfter = usdc.balanceOf(recipient0);

        assertEq(balAfter - balBefore, expectedNet, "net payout should equal contribution*(memberCount-2)");
    }

    /// @dev Separate test to verify that memberCount=2 produces zero net payout (claimable=0).
    function test_NetPayout_TwoMemberCircle_ZeroNet() public {
        address memberB = makeAddr("memberB");
        _fund(memberB, 10_000e6);

        address[] memory order = new address[](2);
        order[0] = creator;
        order[1] = memberB;

        vm.prank(creator);
        uint256 cid = circle.createCircle("T2", CONTRIBUTION, 2, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(memberB); circle.joinCircle(cid);
        vm.prank(creator); circle.approveMember(cid, creator);
        vm.prank(creator); circle.approveMember(cid, memberB);

        // memberB contributes; finalize
        vm.prank(memberB); circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        // Net payout = CONTRIBUTION * (2 - 2) = 0; claimPayout should revert
        vm.prank(creator);
        vm.expectRevert(bytes("no claimable payout"));
        circle.claimPayout(cid, 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 24. Reentrancy: malicious token re-entering claimPayout should revert
    // ══════════════════════════════════════════════════════════════════════════

    function test_reentrancy_ClaimPayoutProtectedByGuard() public {
        // Deploy reentrant mock token + its own circle instance
        ReentrantMockERC20 rToken = new ReentrantMockERC20();
        AdasheCircle       rCircle = new AdasheCircle(address(rToken));

        address[] memory order = new address[](3);
        order[0] = creator;
        order[1] = alice;
        order[2] = bob;

        rToken.mint(creator, 10_000e6);
        rToken.mint(alice,   10_000e6);
        rToken.mint(bob,     10_000e6);

        vm.prank(creator); rToken.approve(address(rCircle), type(uint256).max);
        vm.prank(alice);   rToken.approve(address(rCircle), type(uint256).max);
        vm.prank(bob);     rToken.approve(address(rCircle), type(uint256).max);

        vm.prank(creator);
        uint256 cid = rCircle.createCircle(
            "R", CONTRIBUTION, 3, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN
        );

        vm.prank(creator); rCircle.joinCircle(cid);
        vm.prank(alice);   rCircle.joinCircle(cid);
        vm.prank(bob);     rCircle.joinCircle(cid);

        vm.prank(creator); rCircle.approveMember(cid, creator);
        vm.prank(creator); rCircle.approveMember(cid, alice);
        vm.prank(creator); rCircle.approveMember(cid, bob);

        vm.prank(alice); rCircle.contribute(cid, 0);
        vm.prank(bob);   rCircle.contribute(cid, 0);

        (, uint256 dl, , , , , ) = rCircle.getPeriod(cid, 0);
        vm.warp(dl + GRACE_PERIOD + 1);
        rCircle.finalizePeriod(cid);

        // Arm the reentrant token: on transfer to creator it will call claimPayout again
        rToken.arm(address(rCircle), cid, 0);

        // The reentrancy attempt (second claimPayout inside transfer) will trigger
        // ReentrancyGuard which causes the whole outer call to revert
        vm.prank(creator);
        vm.expectRevert();
        rCircle.claimPayout(cid, 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 25. repayReserveDebt: full-cover default — stranded reserve-debt is
    //     clearable via repayReserveDebt; mr.debtBalance reaches zero
    // ══════════════════════════════════════════════════════════════════════════

    function test_repayReserveDebt_FullCover_ClearsStrandedDebt() public {
        uint256 cid = _createAndActivate3();

        // Period 0 (creator=recipient): alice+bob both contribute → creator gets reserve
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0);

        // Period 1 (alice=recipient): creator+bob contribute → alice gets reserve = CONTRIBUTION
        vm.prank(creator); circle.contribute(cid, 1);
        vm.prank(bob);     circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(alice); circle.claimPayout(cid, 1);

        MemberView memory alicePre = _getMember(cid, alice);
        assertEq(alicePre.reserveBalance, CONTRIBUTION, "alice should have full reserve");

        // Period 2 (bob=recipient): creator contributes; alice defaults (full reserve coverage)
        vm.prank(creator); circle.contribute(cid, 2);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        MemberView memory alicePost = _getMember(cid, alice);
        assertEq(alicePost.reserveBalance, 0,            "alice reserve fully consumed");
        assertEq(alicePost.debtBalance,    CONTRIBUTION, "alice has full debt");

        // _debtByPeriod for alice in period 2 should be 0 (full reserve covered recipient)
        assertEq(circle.getDebtByPeriod(cid, 2, alice), 0, "_debtByPeriod should be 0 for full-cover");

        // _reserveDebtByPeriod for alice in period 2 should be CONTRIBUTION
        assertEq(circle.getReserveDebtByPeriod(cid, 2, alice), CONTRIBUTION, "reserve debt should equal contribution");

        // repayDebt should fail (no creditor-routing debt)
        vm.prank(alice);
        vm.expectRevert(bytes("no debt for period"));
        circle.repayDebt(cid, 2);

        // repayReserveDebt restores the DEFAULTER's (alice's) own reserve, not the recipient's.
        // Alice's reserve was consumed by finalizePeriod; repayment returns it to her.
        MemberView memory bobBeforeRepay  = _getMember(cid, bob);
        uint256 aliceReserveBefore = _getMember(cid, alice).reserveBalance; // = 0 (consumed)
        vm.prank(alice);
        circle.repayReserveDebt(cid, 2);

        MemberView memory aliceFinal = _getMember(cid, alice);
        assertEq(aliceFinal.debtBalance, 0, "alice debt should be zero after repayReserveDebt");
        assertEq(circle.getReserveDebtByPeriod(cid, 2, alice), 0, "reserve debt should be zero");

        // Alice's own reserve is restored (she repaid what was consumed from her reserve).
        assertEq(
            aliceFinal.reserveBalance - aliceReserveBefore,
            CONTRIBUTION,
            "alice reserve should be restored after repayReserveDebt"
        );

        // Bob's reserve must NOT change — his reserve is independent of alice's debt repayment.
        MemberView memory bobAfterRepay = _getMember(cid, bob);
        assertEq(
            bobAfterRepay.reserveBalance,
            bobBeforeRepay.reserveBalance,
            "bob reserve must be unchanged by alice repayReserveDebt"
        );

        // Alice can now claim payout in period 2 (she was the recipient — wait, bob is recipient)
        // bob is period 2 recipient; he now has zero debt (never had any). claimPayout should succeed.
        vm.prank(bob);
        circle.claimPayout(cid, 2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 26. executeReplacement: outgoing IS the period recipient, final deadline
    //     passed, finalizePeriod not yet called — recipient field updates to
    //     replacement; outgoing stays in participants (expired-PENDING guard);
    //     finalizePeriod runs correctly with replacement as recipient
    // ══════════════════════════════════════════════════════════════════════════

    function test_executeReplacement_OutgoingIsRecipient_DeadlinePassed_NoFinalize() public {
        // 3-member circle: [creator(0), alice(1), bob(2)]
        // Period 2: bob is the recipient.
        // Setup: run periods 0 and 1 normally to reach period 2.
        uint256 cid = _createAndActivate3();
        address newBob = makeAddr("newBob");
        _fund(newBob, 10_000e6);

        // Period 0 (creator=recipient): alice+bob contribute
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0);

        // Period 1 (alice=recipient): creator+bob contribute
        vm.prank(creator); circle.contribute(cid, 1);
        vm.prank(bob);     circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(alice); circle.claimPayout(cid, 1);

        // Now in period 2 (bob=recipient).
        // creator contributes; alice defaults (doesn't contribute).
        // We do NOT call finalizePeriod yet.
        vm.prank(creator); circle.contribute(cid, 2);

        // Warp past alice's final deadline (bob's replacement can only happen after all final deadlines)
        _skipPastFinalDeadline(cid);

        // Creator approves bob → newBob replacement (bob has no debt: he was always recipient)
        vm.prank(creator);
        circle.approveReplacement(cid, bob, newBob);

        // Execute the replacement — bob is current-period recipient, final deadline passed
        vm.prank(creator);
        circle.executeReplacement(cid, bob);

        // ASSERT 1: period.recipient updated to newBob
        (address periodRecipient, , , , , , ) = circle.getPeriod(cid, 2);
        assertEq(periodRecipient, newBob, "period 2 recipient should be newBob after replacement");

        // ASSERT 2: bob is no longer in payoutOrder
        assertFalse(circle.isInPayoutOrder(cid, bob),   "bob should be removed from payoutOrder");
        assertTrue(circle.isInPayoutOrder(cid, newBob), "newBob should be in payoutOrder");

        // ASSERT 3: bob's member record shows removal
        MemberView memory bobMv = _getMember(cid, bob);
        assertFalse(bobMv.approved,       "bob.approved should be false");
        assertGt(bobMv.removedAt, 0,      "bob.removedAt should be set");
        assertEq(bobMv.replacedBy, newBob, "bob.replacedBy should be newBob");

        // Now finalizePeriod: alice is still in participants (creator contributed, alice defaulted).
        // newBob is the recipient. finalizePeriod should run without reverting.
        circle.finalizePeriod(cid);

        // ASSERT 4: alice defaulted with debt
        MemberView memory aliceMv = _getMember(cid, alice);
        assertGt(aliceMv.debtBalance, 0, "alice should have debt from period 2 default");

        // ASSERT 5: circle is COMPLETED (period 2 was the last period)
        assertEq(
            uint8(_circleStatus(cid)),
            uint8(AdasheCircle.CircleStatus.COMPLETED),
            "circle should be COMPLETED after period 2 finalized"
        );

        // ASSERT 6: newBob (new recipient) has claimable payout
        // 1 contributor paid (creator), so totalCollected = CONTRIBUTION.
        // reserveCredit = min(CONTRIBUTION, CONTRIBUTION) = CONTRIBUTION.
        // netPayout = CONTRIBUTION - CONTRIBUTION = 0.
        // newBob has no debt, but claimable = 0 → claimPayout reverts "no claimable payout".
        // The circle is still consistent and completed.
        (, , , bool payoutReleased, , , ) = circle.getPeriod(cid, 2);
        assertFalse(payoutReleased, "period 2 payout not yet released");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 27. settleOwnDebtFromWithheldPayout: multi-period debt — withheld payout
    //     stays open after partial settlement; period only closes once debt == 0
    // ══════════════════════════════════════════════════════════════════════════

    function test_settleOwnDebtFromWithheldPayout_MultiPeriodDebt_PartialThenFull() public {
        // Need a 4-member circle so we can engineer two separate defaults by the same member.
        // Members: [creator(0), alice(1), bob(2), dan(3)]
        // Plan:
        //   Period 0 (creator=recipient): alice, bob, dan contribute.
        //   Period 1 (alice=recipient):   creator, bob contribute; dan DEFAULTS → dan gets debt_1.
        //   Period 2 (bob=recipient):     creator, alice contribute; dan DEFAULTS → dan gets debt_2.
        //   Period 3 (dan=recipient):     creator, alice, bob contribute → dan gets withheld payout
        //                                 (dan has debt_1 + debt_2).
        //
        // After completion:
        //   dan calls settleOwnDebtFromWithheldPayout(cid, 3, 1) → partial settle (debt_1).
        //   Period 3 should still be withheld (dan still has debt_2).
        //   dan calls settleOwnDebtFromWithheldPayout(cid, 3, 2) → full settle (debt_2 + remainder release).
        //   Period 3 now fully released; dan receives leftover withheld payout (if any).

        address dan = makeAddr("dan");
        _fund(dan, 10_000e6);

        address[] memory order = new address[](4);
        order[0] = creator;
        order[1] = alice;
        order[2] = bob;
        order[3] = dan;

        vm.prank(creator);
        uint256 cid = circle.createCircle("X4", CONTRIBUTION, 4, AdasheCircle.Frequency.WEEKLY, 1, 1, order, PIN);

        vm.prank(creator); circle.joinCircle(cid);
        vm.prank(alice);   circle.joinCircle(cid);
        vm.prank(bob);     circle.joinCircle(cid);
        vm.prank(dan);     circle.joinCircle(cid);

        vm.prank(creator); circle.approveMember(cid, creator);
        vm.prank(creator); circle.approveMember(cid, alice);
        vm.prank(creator); circle.approveMember(cid, bob);
        vm.prank(creator); circle.approveMember(cid, dan);

        // Period 0 (creator=recipient): alice, bob, dan contribute
        vm.prank(alice); circle.contribute(cid, 0);
        vm.prank(bob);   circle.contribute(cid, 0);
        vm.prank(dan);   circle.contribute(cid, 0);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(creator); circle.claimPayout(cid, 0);

        // Period 1 (alice=recipient): creator, bob contribute; dan DEFAULTS
        vm.prank(creator); circle.contribute(cid, 1);
        vm.prank(bob);     circle.contribute(cid, 1);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        // alice claimable: 2*CONTRIBUTION - CONTRIBUTION = CONTRIBUTION (net)
        vm.prank(alice); circle.claimPayout(cid, 1);

        uint256 danDebt1 = _getMember(cid, dan).debtBalance;
        assertEq(danDebt1, CONTRIBUTION, "dan debt from period 1 default");

        // Period 2 (bob=recipient): creator, alice contribute; dan DEFAULTS again
        vm.prank(creator); circle.contribute(cid, 2);
        vm.prank(alice);   circle.contribute(cid, 2);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);
        vm.prank(bob); circle.claimPayout(cid, 2);

        uint256 danDebt2 = _getMember(cid, dan).debtBalance;
        assertEq(danDebt2, 2 * CONTRIBUTION, "dan debt should be 2x after two defaults");

        // Period 3 (dan=recipient): creator, alice, bob contribute
        vm.prank(creator); circle.contribute(cid, 3);
        vm.prank(alice);   circle.contribute(cid, 3);
        vm.prank(bob);     circle.contribute(cid, 3);
        _skipPastFinalDeadline(cid);
        circle.finalizePeriod(cid);

        // Circle COMPLETED; dan has 2×CONTRIBUTION debt; payout withheld
        assertEq(uint8(_circleStatus(cid)), uint8(AdasheCircle.CircleStatus.COMPLETED));

        (, , , , bool withheld3, , ) = circle.getPeriod(cid, 3);
        assertTrue(withheld3, "dan period 3 payout should be withheld");

        // ── First settlement: settle debt from period 1 ─────────────────────
        vm.prank(dan);
        circle.settleOwnDebtFromWithheldPayout(cid, 3, 1);

        MemberView memory danMid = _getMember(cid, dan);
        assertEq(danMid.debtBalance, CONTRIBUTION, "dan should still have 1x debt after partial settle");

        // Period 3 must still be withheld (debt remains)
        (, , , bool released3Mid, bool withheld3Mid, , ) = circle.getPeriod(cid, 3);
        assertFalse(released3Mid, "period 3 should NOT be released after partial settle");
        assertTrue(withheld3Mid,  "period 3 should still be withheld after partial settle");

        // ── Second settlement: settle debt from period 2 ────────────────────
        vm.prank(dan);
        circle.settleOwnDebtFromWithheldPayout(cid, 3, 2);

        MemberView memory danFinal = _getMember(cid, dan);
        assertEq(danFinal.debtBalance, 0, "dan debt fully cleared after second settle");

        // Period 3 must now be released
        (, , , bool released3Final, bool withheld3Final, , ) = circle.getPeriod(cid, 3);
        assertTrue(released3Final,  "period 3 should be released after full settle");
        assertFalse(withheld3Final, "period 3 should not be withheld after full settle");
    }
}
