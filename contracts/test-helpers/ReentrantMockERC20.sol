// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IAdasheCircle {
    function claimPayout(uint256 circleId, uint256 periodIndex) external;
}

/// @dev A malicious ERC-20 whose transfer() calls back into AdasheCircle.claimPayout.
///      Used to test ReentrancyGuard protection on claimPayout.
contract ReentrantMockERC20 is ERC20 {
    uint8 private _dec;
    IAdasheCircle public victim;
    uint256 public circleId;
    uint256 public periodIndex;
    bool public armed;

    constructor() ERC20("RMock", "RMK") {
        _dec = 6;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address _victim, uint256 _circleId, uint256 _periodIndex) external {
        victim = IAdasheCircle(_victim);
        circleId = _circleId;
        periodIndex = _periodIndex;
        armed = true;
    }

    function disarm() external {
        armed = false;
    }

    /// Override transfer to inject reentrancy attempt.
    function transfer(address to, uint256 amount) public override returns (bool) {
        super.transfer(to, amount);
        if (armed) {
            armed = false; // prevent infinite loop
            victim.claimPayout(circleId, periodIndex);
        }
        return true;
    }
}
