// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAdasheCircle {
    function claimPayout(uint256 circleId, uint256 periodIndex) external;
}

/// @dev Attempts a reentrant claimPayout on ERC-20 receive callback.
///      Used to verify ReentrancyGuard protection.
contract ReentrantClaimer {
    IAdasheCircle public target;
    uint256 public circleId;
    uint256 public periodIndex;
    bool public attacking;

    function setup(address _target, uint256 _circleId, uint256 _periodIndex) external {
        target = IAdasheCircle(_target);
        circleId = _circleId;
        periodIndex = _periodIndex;
    }

    /// Called by the test to trigger the claim.
    function attack() external {
        attacking = true;
        target.claimPayout(circleId, periodIndex);
        attacking = false;
    }

    /// Fallback invoked when USDC (MockERC20) transfer hits this address.
    /// Because SafeERC20 uses low-level call, receipt lands here only if
    /// token is native ETH — with ERC-20 the reentrancy must be injected
    /// differently. We expose a hook the test can call directly via
    /// a crafted mock. See test for the actual pattern used.
    receive() external payable {
        if (attacking) {
            target.claimPayout(circleId, periodIndex);
        }
    }
}
