// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../AdasheCircle.sol";
import "../test-helpers/MockERC20.sol";

/**
 * BlocklistRepayTest — verifies the pull-model fix for USDC-blocklisted creditors.
 *
 * Before the fix: repayDebt() pushed USDC directly to the creditor. If the creditor
 * was USDC-blocklisted the safeTransfer reverted, permanently blocking the debtor.
 *
 * After the fix: repayDebt() credits _pendingCreditorBalance[circleId][creditor].
 * The debtor's transaction always succeeds. The creditor pulls via claimLateRepayment().
 */
contract BlocklistRepayTest is Test {
    AdasheCircle public adashe;
    MockERC20     public usdc;

    address public creator = makeAddr("creator");   // period-0 recipient
    address public alice   = makeAddr("alice");     // period-1 recipient — simulates blocklisted creditor
    address public bob     = makeAddr("bob");       // defaults on alice's period
    address public carol   = makeAddr("carol");

    uint256 public constant CONTRIBUTION = 100e6; // 100 USDC
    uint256 public cid;

    // Circle struct field indices (for circles() tuple destructuring)
    // 0:circleId 1:creator 2:name 3:contributionAmount 4:memberCount 5:frequency
    // 6:weekday 7:anchorDay 8:pinHash 9:status 10:startTime 11:currentPeriod
    // 12:payoutOrder 13:reserveAmount 14:gracePeriod
    // MemberRecord: 0:approved 1:joined 2:reserveBalance 3:debtBalance 4:removedAt 5:replacedBy

    function setUp() public {
        usdc  = new MockERC20("USDC", "USDC", 6);
        adashe = new AdasheCircle(address(usdc));

        address[4] memory wallets = [creator, alice, bob, carol];
        for (uint i = 0; i < 4; i++) {
            usdc.mint(wallets[i], 10_000e6);
            vm.prank(wallets[i]);
            usdc.approve(address(adashe), type(uint256).max);
        }

        // payoutOrder = [creator, alice, bob, carol]
        address[] memory order = new address[](4);
        order[0] = creator; order[1] = alice; order[2] = bob; order[3] = carol;

        vm.prank(creator);
        cid = adashe.createCircle(
            "BlocklistTest",
            CONTRIBUTION,
            4,
            AdasheCircle.Frequency.DAILY,
            0,          // weekday
            0,          // anchorDay
            order,
            bytes32(0)  // pinHash
        );

        vm.prank(alice);  adashe.joinCircle(cid);
        vm.prank(bob);    adashe.joinCircle(cid);
        vm.prank(carol);  adashe.joinCircle(cid);
        vm.prank(creator); adashe.startCircle(cid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _currentPeriod() internal view returns (uint256) {
        (,,,,,,,,,, , uint8 cp,,) = adashe.circles(cid);
        return cp;
    }

    function _finalizeCurrentPeriod() internal {
        uint256 pi = _currentPeriod();
        (,  uint256 deadline, , , , , , , ) = adashe.getPeriod(cid, pi);
        // grace period for DAILY = 12 hours
        vm.warp(deadline + 12 hours + 1);
        adashe.finalizePeriod(cid);
    }

    function _debtBalanceOf(address member) internal view returns (uint256) {
        (, , , uint256 debt, , ) = adashe.memberRecords(cid, member);
        return debt;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Setup: period 0 creator receives, period 1 alice receives and bob defaults
    // ─────────────────────────────────────────────────────────────────────────
    function _setupAlicePaidOutBobHasDebt() internal {
        // Period 0: everyone contributes; creator claims payout
        vm.prank(alice);  adashe.contribute(cid, 0);
        vm.prank(bob);    adashe.contribute(cid, 0);
        vm.prank(carol);  adashe.contribute(cid, 0);
        _finalizeCurrentPeriod();
        vm.prank(creator); adashe.claimPayout(cid, 0);

        // Period 1: alice is recipient; bob defaults (skips); creator + carol contribute
        vm.prank(creator); adashe.contribute(cid, 1);
        vm.prank(carol);   adashe.contribute(cid, 1);
        // bob deliberately skips — reserve covers his default, bob gains debt to alice
        _finalizeCurrentPeriod();

        // Verify alice's payout is available and NOT withheld
        (, , , bool released1, bool withheld1, , , , ) = adashe.getPeriod(cid, 1);
        assertFalse(released1, "should not be released yet");
        assertFalse(withheld1, "alice has no debt so payout should not be withheld");

        // alice claims her payout — now payoutReleased = true
        vm.prank(alice); adashe.claimPayout(cid, 1);

        (, , , bool releasedAfter, , , , , ) = adashe.getPeriod(cid, 1);
        assertTrue(releasedAfter, "alice payout should be released after claim");

        assertGt(_debtBalanceOf(bob), 0, "bob should have debt after defaulting");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: repayDebt after payout released → credits pendingCreditorBalance, NOT wallet
    // ─────────────────────────────────────────────────────────────────────────
    function test_repayDebt_AfterPayoutReleased_CreditsPendingBalance() public {
        _setupAlicePaidOutBobHasDebt();

        uint256 aliceWalletBefore  = usdc.balanceOf(alice);
        uint256 pendingBefore      = adashe.getPendingCreditorBalance(cid, alice);
        assertEq(pendingBefore, 0, "alice pending should start at 0");

        vm.prank(bob);
        adashe.repayDebt(cid, 1);

        // alice's wallet must NOT have received a push
        assertEq(usdc.balanceOf(alice), aliceWalletBefore, "no direct push to alice wallet");

        // pending balance must reflect the repayment
        uint256 pendingAfter = adashe.getPendingCreditorBalance(cid, alice);
        assertEq(pendingAfter, CONTRIBUTION, "pending creditor balance should equal CONTRIBUTION");

        // bob's debt should be cleared
        assertEq(_debtBalanceOf(bob), 0, "bob debt should be cleared");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: claimLateRepayment transfers pending balance to creditor wallet
    // ─────────────────────────────────────────────────────────────────────────
    function test_claimLateRepayment_TransfersPendingToCreditor() public {
        _setupAlicePaidOutBobHasDebt();
        vm.prank(bob); adashe.repayDebt(cid, 1);

        uint256 aliceBalBefore = usdc.balanceOf(alice);
        uint256 pending = adashe.getPendingCreditorBalance(cid, alice);
        assertGt(pending, 0, "alice should have pending balance");

        vm.prank(alice);
        adashe.claimLateRepayment(cid);

        assertEq(usdc.balanceOf(alice), aliceBalBefore + pending, "alice wallet should receive pending");
        assertEq(adashe.getPendingCreditorBalance(cid, alice), 0, "pending cleared after claim");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: repayDebt before payout released → still credits claimableAmount (regression)
    // ─────────────────────────────────────────────────────────────────────────
    function test_repayDebt_BeforePayoutReleased_CreditsClaimableAmount() public {
        // Period 0
        vm.prank(alice);  adashe.contribute(cid, 0);
        vm.prank(bob);    adashe.contribute(cid, 0);
        vm.prank(carol);  adashe.contribute(cid, 0);
        _finalizeCurrentPeriod();
        vm.prank(creator); adashe.claimPayout(cid, 0);

        // Period 1: bob defaults; alice has not yet claimed
        vm.prank(creator); adashe.contribute(cid, 1);
        vm.prank(carol);   adashe.contribute(cid, 1);
        _finalizeCurrentPeriod();

        (, , , bool released, , , uint256 claimBefore, , ) = adashe.getPeriod(cid, 1);
        assertFalse(released, "payout not released yet");

        vm.prank(bob); adashe.repayDebt(cid, 1);

        (, , , , , , uint256 claimAfter, , ) = adashe.getPeriod(cid, 1);
        assertEq(claimAfter, claimBefore + CONTRIBUTION, "claimableAmount should increase");
        assertEq(adashe.getPendingCreditorBalance(cid, alice), 0, "no pending when not yet released");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: claimLateRepayment reverts when nothing pending
    // ─────────────────────────────────────────────────────────────────────────
    function test_claimLateRepayment_RevertsWhenNothingPending() public {
        vm.prank(alice);
        vm.expectRevert("no pending repayment");
        adashe.claimLateRepayment(cid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: double claimLateRepayment reverts
    // ─────────────────────────────────────────────────────────────────────────
    function test_claimLateRepayment_RevertsOnDoubleCall() public {
        _setupAlicePaidOutBobHasDebt();
        vm.prank(bob); adashe.repayDebt(cid, 1);
        vm.prank(alice); adashe.claimLateRepayment(cid);
        vm.prank(alice);
        vm.expectRevert("no pending repayment");
        adashe.claimLateRepayment(cid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: pending balance accumulates across multiple repayment calls.
    //         bob defaults on alice's period (period 1) AND carol's period (period 3).
    //         After alice and carol each claim their payouts, bob repays both debts.
    //         Each repayDebt call should credit the respective creditor's pending balance.
    // ─────────────────────────────────────────────────────────────────────────
    function test_pendingBalance_AccumulatesAcrossRepayments() public {
        // Period 0: creator receives. Everyone contributes.
        vm.prank(alice); adashe.contribute(cid, 0);
        vm.prank(bob);   adashe.contribute(cid, 0);
        vm.prank(carol); adashe.contribute(cid, 0);
        _finalizeCurrentPeriod();
        vm.prank(creator); adashe.claimPayout(cid, 0);

        // Period 1: alice receives. bob defaults.
        vm.prank(creator); adashe.contribute(cid, 1);
        vm.prank(carol);   adashe.contribute(cid, 1);
        // bob skips
        _finalizeCurrentPeriod();
        vm.prank(alice); adashe.claimPayout(cid, 1);
        (, , , bool aliceReleased, , , , , ) = adashe.getPeriod(cid, 1);
        assertTrue(aliceReleased, "alice payout released");

        // Period 2: bob receives. Everyone contributes (bob has debt so payout withheld).
        vm.prank(alice);   adashe.contribute(cid, 2);
        vm.prank(creator); adashe.contribute(cid, 2);
        vm.prank(carol);   adashe.contribute(cid, 2);
        _finalizeCurrentPeriod();
        // bob's payout is withheld — do not claim

        // Period 3: carol receives. bob contributes (still has debt but must contribute).
        // carol's period should also show bob having debt.
        vm.prank(alice);   adashe.contribute(cid, 3);
        vm.prank(bob);     adashe.contribute(cid, 3);
        vm.prank(creator); adashe.contribute(cid, 3);
        _finalizeCurrentPeriod();
        vm.prank(carol); adashe.claimPayout(cid, 3);
        (, , , bool carolReleased, , , , , ) = adashe.getPeriod(cid, 3);
        assertTrue(carolReleased, "carol payout released");

        // bob still has debt from period 1 (to alice).
        // Repaying period 1 debt after alice released her payout → credits alice's pending balance.
        assertGt(_debtBalanceOf(bob), 0, "bob should have debt");
        uint256 alicePendingBefore = adashe.getPendingCreditorBalance(cid, alice);
        assertEq(alicePendingBefore, 0);

        vm.prank(bob); adashe.repayDebt(cid, 1);

        uint256 alicePending = adashe.getPendingCreditorBalance(cid, alice);
        assertGt(alicePending, 0, "alice pending credited");

        // alice claims
        uint256 aliceBalBefore = usdc.balanceOf(alice);
        vm.prank(alice); adashe.claimLateRepayment(cid);
        assertEq(usdc.balanceOf(alice), aliceBalBefore + alicePending, "alice receives pending");
        assertEq(adashe.getPendingCreditorBalance(cid, alice), 0, "alice pending cleared");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7: settleOwnDebtFromWithheldPayout uses pull model for released creditor
    // ─────────────────────────────────────────────────────────────────────────
    function test_settleOwnDebt_Credits_PendingBalance_WhenCreditorReleased() public {
        // Period 0: creator receives; bob defaults
        vm.prank(alice); adashe.contribute(cid, 0);
        vm.prank(carol); adashe.contribute(cid, 0);
        // bob skips
        _finalizeCurrentPeriod();
        vm.prank(creator); adashe.claimPayout(cid, 0);

        // Period 1: alice receives; everyone contributes normally
        vm.prank(bob);     adashe.contribute(cid, 1);
        vm.prank(creator); adashe.contribute(cid, 1);
        vm.prank(carol);   adashe.contribute(cid, 1);
        _finalizeCurrentPeriod();
        vm.prank(alice); adashe.claimPayout(cid, 1);

        // Period 2: bob receives; others contribute; bob is withheld (debt from period 0)
        vm.prank(alice);   adashe.contribute(cid, 2);
        vm.prank(creator); adashe.contribute(cid, 2);
        vm.prank(carol);   adashe.contribute(cid, 2);
        _finalizeCurrentPeriod();

        (, , , bool bobReleased, bool bobWithheld, , , , ) = adashe.getPeriod(cid, 2);
        assertFalse(bobReleased, "bob not released");
        assertTrue(bobWithheld,  "bob withheld due to debt");

        // Period 3: carol receives — completes the circle
        vm.prank(alice);   adashe.contribute(cid, 3);
        vm.prank(bob);     adashe.contribute(cid, 3);
        vm.prank(creator); adashe.contribute(cid, 3);
        _finalizeCurrentPeriod();
        vm.prank(carol); adashe.claimPayout(cid, 3);

        // Circle COMPLETED. Creator's period (0) payout was already released.
        uint256 creatorPendingBefore = adashe.getPendingCreditorBalance(cid, creator);
        assertEq(creatorPendingBefore, 0, "no pending before settle");

        vm.prank(bob);
        adashe.settleOwnDebtFromWithheldPayout(cid, 2, 0);

        // creator should now have a pending creditor balance (not a push)
        uint256 creatorPendingAfter = adashe.getPendingCreditorBalance(cid, creator);
        assertGt(creatorPendingAfter, 0, "creator pending credited by settle");

        // creator claims
        uint256 creatorBalBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        adashe.claimLateRepayment(cid);
        assertEq(usdc.balanceOf(creator), creatorBalBefore + creatorPendingAfter, "creator receives funds");
        assertEq(adashe.getPendingCreditorBalance(cid, creator), 0, "pending cleared");
    }
}
