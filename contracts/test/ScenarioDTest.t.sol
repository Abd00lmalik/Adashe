// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../AdasheCircle.sol";
import "../test-helpers/MockERC20.sol";

/// @title ScenarioDTest
/// @notice Tests the contributor refund mechanism when a recipient never clears their
///         debt and the circle ends with their payout permanently withheld.
///
/// Scenario:
///   4-member circle: A (period 1), B (period 2), C (period 3), D (period 4)
///   - C defaults on B's period (period 1, index 1). Reserve covers. C has debtBalance > 0.
///   - A, B, D all contribute to C's period (period 2, index 2).
///   - finalizePeriod sets payoutWithheld=true for C (debt outstanding).
///   - C NEVER repays debt. Circle completes through period 4.
///   - After circle ends: A, B, D can call claimContributionRefund to recover their funds.
contract ScenarioDTest is Test {
    AdasheCircle adashe;
    MockERC20    usdc;

    address walletA = makeAddr("walletA"); // period-1 recipient / creator
    address walletB = makeAddr("walletB"); // period-2 recipient
    address walletC = makeAddr("walletC"); // period-3 recipient — will have withheld payout
    address walletD = makeAddr("walletD"); // period-4 recipient
    address stranger = makeAddr("stranger");

    uint256 constant CONTRIBUTION = 50e6; // 50 USDC
    uint256 constant GRACE         = 12 hours;
    uint256 cid;

    // ── helpers ────────────────────────────────────────────────────────────────

    struct MV {
        bool    approved;
        bool    joined;
        uint256 reserveBalance;
        uint256 debtBalance;
        uint256 removedAt;
        address replacedBy;
    }
    function _mv(address who) internal view returns (MV memory v) {
        (v.approved, v.joined, v.reserveBalance, v.debtBalance, v.removedAt, v.replacedBy)
            = adashe.memberRecords(cid, who);
    }

    function _fund(address who) internal {
        usdc.mint(who, 1_000e6);
        vm.prank(who);
        usdc.approve(address(adashe), type(uint256).max);
    }

    function _circleStatus() internal view returns (AdasheCircle.CircleStatus) {
        // circles() auto-getter returns 14 flat values; status is at index 9.
        (, bytes memory raw) = address(adashe).staticcall(
            abi.encodeWithSignature("circles(uint256)", cid)
        );
        uint256 word;
        assembly { word := mload(add(raw, add(32, mul(9, 32)))) }
        return AdasheCircle.CircleStatus(uint8(word));
    }

    function _currentPeriod() internal view returns (uint8) {
        (, bytes memory raw) = address(adashe).staticcall(
            abi.encodeWithSignature("circles(uint256)", cid)
        );
        uint256 word;
        assembly { word := mload(add(raw, add(32, mul(11, 32)))) }
        return uint8(word);
    }

    /// Warp past every contributor's final deadline for the current period and finalize.
    function _finalizeCurrentPeriod() internal {
        (address recipient, uint256 deadline, , , , , , , ) = adashe.getPeriod(cid, _currentPeriod());
        uint256 finalDl = deadline + GRACE;
        if (block.timestamp <= finalDl) vm.warp(finalDl + 1);
        adashe.finalizePeriod(cid);
    }

    // ── setUp: create 4-member DAILY circle, all join, start ──────────────────

    function setUp() public {
        usdc  = new MockERC20("USDC","USDC",6);
        adashe = new AdasheCircle(address(usdc));

        _fund(walletA); _fund(walletB); _fund(walletC); _fund(walletD);
        _fund(stranger);

        address[] memory order = new address[](4);
        order[0] = walletA; order[1] = walletB; order[2] = walletC; order[3] = walletD;

        vm.prank(walletA);
        cid = adashe.createCircle(
            "Refund Test", CONTRIBUTION, 4,
            AdasheCircle.Frequency.DAILY, 0, 0,
            order, bytes32(0)
        );

        vm.prank(walletB); adashe.joinCircle(cid);
        vm.prank(walletC); adashe.joinCircle(cid);
        vm.prank(walletD); adashe.joinCircle(cid);

        vm.prank(walletA); adashe.startCircle(cid);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Scenario D1: Verify setup — C defaults on B's period, C has debt after
    //              period 1 (B's payout) is finalized.
    // ══════════════════════════════════════════════════════════════════════════
    function test_scenarioD1_CDefaultsOnBPeriod_HasDebtAfterFinalize() public {
        // Period 0 (A receives): C, B, D all contribute; A gets payout.
        (address recipient0, , , , , , , , ) = adashe.getPeriod(cid, 0);
        assertEq(recipient0, walletA);

        vm.prank(walletB); adashe.contribute(cid, 0);
        vm.prank(walletC); adashe.contribute(cid, 0);
        vm.prank(walletD); adashe.contribute(cid, 0);
        _finalizeCurrentPeriod();
        vm.prank(walletA); adashe.claimPayout(cid, 0);

        // Period 1 (B receives): A, C, D contribute; C pays normally.
        (address recipient1, , , , , , , , ) = adashe.getPeriod(cid, 1);
        assertEq(recipient1, walletB);

        vm.prank(walletA); adashe.contribute(cid, 1);
        // C deliberately does NOT contribute to B's period.
        vm.prank(walletD); adashe.contribute(cid, 1);
        _finalizeCurrentPeriod(); // C is defaulted; reserve covers (C had reserve from period 0)

        MV memory mvC = _mv(walletC);
        assertGt(mvC.debtBalance, 0, "C should have debt after defaulting on B's period");
        assertEq(mvC.reserveBalance, 0, "C's reserve should have been consumed");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Scenario D2: C's payout is withheld when period 2 is finalized.
    // ══════════════════════════════════════════════════════════════════════════
    function test_scenarioD2_CPeriodPayout_IsWithheld() public {
        // Advance through periods 0 and 1.
        vm.prank(walletB); adashe.contribute(cid, 0);
        vm.prank(walletC); adashe.contribute(cid, 0);
        vm.prank(walletD); adashe.contribute(cid, 0);
        _finalizeCurrentPeriod();
        vm.prank(walletA); adashe.claimPayout(cid, 0);

        vm.prank(walletA); adashe.contribute(cid, 1);
        vm.prank(walletD); adashe.contribute(cid, 1);
        // C skips — reserve covers, C gains debt
        _finalizeCurrentPeriod();

        // Period 2 (C receives): A, B, D all contribute.
        (address recipient2, , , , , , , , ) = adashe.getPeriod(cid, 2);
        assertEq(recipient2, walletC);

        vm.prank(walletA); adashe.contribute(cid, 2);
        vm.prank(walletB); adashe.contribute(cid, 2);
        vm.prank(walletD); adashe.contribute(cid, 2);
        _finalizeCurrentPeriod();

        (, , , bool released, bool withheld, uint256 withheldAmt, uint256 claimable, , ) =
            adashe.getPeriod(cid, 2);
        assertFalse(released, "C's period should NOT be released");
        assertTrue(withheld,  "C's period should be withheld (has debt)");
        assertGt(withheldAmt + claimable, 0, "withheld amount should be positive");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Scenario D3: Circle completes (D's period finalized), C never repays.
    //              A, B, D can each claim their contribution refund.
    // ══════════════════════════════════════════════════════════════════════════
    function test_scenarioD3_ContributorRefunds_AfterCircleCompletes() public {
        // ── Period 0: A receives ──
        vm.prank(walletB); adashe.contribute(cid, 0);
        vm.prank(walletC); adashe.contribute(cid, 0);
        vm.prank(walletD); adashe.contribute(cid, 0);
        _finalizeCurrentPeriod();
        vm.prank(walletA); adashe.claimPayout(cid, 0);

        // ── Period 1: B receives; C defaults (reserve covers) ──
        vm.prank(walletA); adashe.contribute(cid, 1);
        vm.prank(walletD); adashe.contribute(cid, 1);
        _finalizeCurrentPeriod();
        vm.prank(walletB); adashe.claimPayout(cid, 1);

        // ── Period 2: C receives; A, B, D contribute; payout withheld ──
        vm.prank(walletA); adashe.contribute(cid, 2);
        vm.prank(walletB); adashe.contribute(cid, 2);
        vm.prank(walletD); adashe.contribute(cid, 2);
        _finalizeCurrentPeriod();
        // C cannot claim — has debt. C never repays.

        // ── Period 3: D receives; A, B, C contribute ──
        vm.prank(walletA); adashe.contribute(cid, 3);
        vm.prank(walletB); adashe.contribute(cid, 3);
        vm.prank(walletC); adashe.contribute(cid, 3);
        _finalizeCurrentPeriod();
        vm.prank(walletD); adashe.claimPayout(cid, 3);

        // Circle is now COMPLETED.
        assertEq(
            uint8(_circleStatus()),
            uint8(AdasheCircle.CircleStatus.COMPLETED),
            "circle should be completed"
        );

        // Verify period 2 payout is still withheld.
        (, , , bool released2, bool withheld2, , uint256 claimable2, , ) = adashe.getPeriod(cid, 2);
        assertFalse(released2, "period 2 should not be released");
        assertTrue(withheld2,  "period 2 should be withheld");

        // Record balances before refunds.
        uint256 aBalBefore = usdc.balanceOf(walletA);
        uint256 bBalBefore = usdc.balanceOf(walletB);

        // Compute actual claimable amount for period 2.
        // netPayout = 3 × CONTRIBUTION − reserveCredit(CONTRIBUTION) = 2 × CONTRIBUTION
        // The reserve (CONTRIBUTION) is held separately and credited at finalization.
        // So total refundable = claimable2 = 2 × CONTRIBUTION.
        // Only 2 contributors can receive full refunds. The 3rd finds claimableAmount = 0.
        assertEq(claimable2, 2 * CONTRIBUTION, "claimable should be 2 x CONTRIBUTION");

        // A claims their contribution refund (full CONTRIBUTION, claimable → CONTRIBUTION).
        vm.prank(walletA);
        adashe.claimContributionRefund(cid, 2);
        assertEq(usdc.balanceOf(walletA), aBalBefore + CONTRIBUTION, "A should get CONTRIBUTION back");
        assertTrue(adashe.hasClaimedContributionRefund(cid, 2, walletA), "A refund flag set");

        // B claims their contribution refund (full CONTRIBUTION, claimable → 0).
        vm.prank(walletB);
        adashe.claimContributionRefund(cid, 2);
        assertEq(usdc.balanceOf(walletB), bBalBefore + CONTRIBUTION, "B should get CONTRIBUTION back");
        assertTrue(adashe.hasClaimedContributionRefund(cid, 2, walletB), "B refund flag set");

        // D tries to claim but claimableAmount is already 0 — should revert.
        vm.prank(walletD);
        vm.expectRevert("no withheld funds remaining");
        adashe.claimContributionRefund(cid, 2);

        // claimableAmount should be 0 after A and B claimed.
        (, , , , , , uint256 claimableAfter, , ) = adashe.getPeriod(cid, 2);
        assertEq(claimableAfter, 0, "claimableAmount should be 0 after refunds exhausted");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Scenario D4: Double-claim reverts.
    // ══════════════════════════════════════════════════════════════════════════
    function test_scenarioD4_DoubleClaimRefundReverts() public {
        _setupCompletedCircleWithWithheldPeriod2();

        vm.prank(walletA);
        adashe.claimContributionRefund(cid, 2);

        vm.prank(walletA);
        vm.expectRevert("refund already claimed");
        adashe.claimContributionRefund(cid, 2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Scenario D5: Recipient C cannot call claimContributionRefund on own period.
    // ══════════════════════════════════════════════════════════════════════════
    function test_scenarioD5_RecipientCannotClaimContributionRefund() public {
        _setupCompletedCircleWithWithheldPeriod2();

        vm.prank(walletC);
        vm.expectRevert("recipient cannot claim contribution refund");
        adashe.claimContributionRefund(cid, 2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Scenario D6: Non-contributor (stranger) cannot claim refund.
    // ══════════════════════════════════════════════════════════════════════════
    function test_scenarioD6_NonContributorCannotClaimRefund() public {
        _setupCompletedCircleWithWithheldPeriod2();

        vm.prank(stranger);
        vm.expectRevert("no paid contribution found");
        adashe.claimContributionRefund(cid, 2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Scenario D7: Cannot claim refund on a normally-released period.
    // ══════════════════════════════════════════════════════════════════════════
    function test_scenarioD7_NormallyReleasedPeriodCannotBeRefunded() public {
        _setupCompletedCircleWithWithheldPeriod2();

        // Period 0 was released normally.
        vm.prank(walletB);
        vm.expectRevert("payout not withheld or already released");
        adashe.claimContributionRefund(cid, 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Scenario D8: Cannot claim refund while circle is still ACTIVE.
    // ══════════════════════════════════════════════════════════════════════════
    function test_scenarioD8_CannotClaimRefundWhileCircleActive() public {
        // Only advance through period 1, leaving circle ACTIVE at period 2.
        vm.prank(walletB); adashe.contribute(cid, 0);
        vm.prank(walletC); adashe.contribute(cid, 0);
        vm.prank(walletD); adashe.contribute(cid, 0);
        _finalizeCurrentPeriod();
        vm.prank(walletA); adashe.claimPayout(cid, 0);

        vm.prank(walletA); adashe.contribute(cid, 1);
        vm.prank(walletD); adashe.contribute(cid, 1);
        _finalizeCurrentPeriod();

        // C's period is now active. Warp past grace but do NOT finalize period 3+4.
        vm.prank(walletA); adashe.contribute(cid, 2);
        vm.prank(walletB); adashe.contribute(cid, 2);
        vm.prank(walletD); adashe.contribute(cid, 2);
        _finalizeCurrentPeriod(); // period 2 finalized, payout withheld

        // Circle is still ACTIVE (period 3 not done yet).
        assertEq(
            uint8(_circleStatus()),
            uint8(AdasheCircle.CircleStatus.ACTIVE),
            "circle should still be active"
        );

        vm.prank(walletA);
        vm.expectRevert("circle not completed");
        adashe.claimContributionRefund(cid, 2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Scenario D9: C can still use settleOwnDebtFromWithheldPayout after partial refunds
    //              but only for the remaining claimableAmount.
    // ══════════════════════════════════════════════════════════════════════════
    function test_scenarioD9_CCanStillSettleFromResidualPayout() public {
        _setupCompletedCircleWithWithheldPeriod2();

        // Only A claims their refund (not B or D).
        uint256 cBalBefore = usdc.balanceOf(walletC);
        vm.prank(walletA);
        adashe.claimContributionRefund(cid, 2);

        // C has debtBalance from period 1 (B's period index 1).
        // C can still settle that debt from the withheld payout using settleOwnDebtFromWithheldPayout.
        MV memory mvC = _mv(walletC);
        assertGt(mvC.debtBalance, 0, "C still has debt");

        (, , , , , , uint256 claimableAfter, , ) = adashe.getPeriod(cid, 2);
        // After A's refund of CONTRIBUTION, claimableAmount is reduced.
        // netPayout was 2×CONTRIBUTION, A took CONTRIBUTION → residual = CONTRIBUTION.
        assertEq(claimableAfter, CONTRIBUTION, "residual claimable should be CONTRIBUTION");

        // C settles their debt from the withheld payout.
        vm.prank(walletC);
        adashe.settleOwnDebtFromWithheldPayout(cid, 2, 1);

        // After settlement, C's debt should be 0 and payout released.
        MV memory mvCAfter = _mv(walletC);
        assertEq(mvCAfter.debtBalance, 0, "C's debt should be cleared");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Helper: Run full 4-period circle to completion with C's payout withheld.
    // ══════════════════════════════════════════════════════════════════════════
    function _setupCompletedCircleWithWithheldPeriod2() internal {
        // Period 0: A receives. B, C, D contribute.
        vm.prank(walletB); adashe.contribute(cid, 0);
        vm.prank(walletC); adashe.contribute(cid, 0);
        vm.prank(walletD); adashe.contribute(cid, 0);
        _finalizeCurrentPeriod();
        vm.prank(walletA); adashe.claimPayout(cid, 0);

        // Period 1: B receives. A, D contribute. C defaults (reserve covers → C has debt).
        vm.prank(walletA); adashe.contribute(cid, 1);
        vm.prank(walletD); adashe.contribute(cid, 1);
        _finalizeCurrentPeriod();
        vm.prank(walletB); adashe.claimPayout(cid, 1);

        // Period 2: C receives. A, B, D contribute. C has debt → payout withheld.
        vm.prank(walletA); adashe.contribute(cid, 2);
        vm.prank(walletB); adashe.contribute(cid, 2);
        vm.prank(walletD); adashe.contribute(cid, 2);
        _finalizeCurrentPeriod();
        // C deliberately never calls claimPayout or repays debt.

        // Period 3: D receives. A, B, C contribute. Circle completes.
        vm.prank(walletA); adashe.contribute(cid, 3);
        vm.prank(walletB); adashe.contribute(cid, 3);
        vm.prank(walletC); adashe.contribute(cid, 3);
        _finalizeCurrentPeriod();
        vm.prank(walletD); adashe.claimPayout(cid, 3);

        assertEq(
            uint8(_circleStatus()),
            uint8(AdasheCircle.CircleStatus.COMPLETED),
            "circle should be completed"
        );
    }
}
