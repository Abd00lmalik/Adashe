// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../AdasheCircle.sol";

/**
 * @title DeployMainnet
 * @notice Deployment script for AdasheCircle on Arc Mainnet.
 *
 * BEFORE RUNNING:
 *   1. Set DEPLOYER_PRIVATE_KEY in your environment (never commit it).
 *   2. Verify the USDC address below against https://docs.arc.io
 *   3. Run on a fork first: forge script ... --fork-url https://rpc.mainnet.arc.io --dry-run
 *   4. Only broadcast when you have verified the output.
 *
 * RUN (dry-run, no broadcast):
 *   forge script contracts/script/DeployMainnet.s.sol \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --private-key $DEPLOYER_PRIVATE_KEY
 *
 * RUN (live broadcast):
 *   forge script contracts/script/DeployMainnet.s.sol \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast \
 *     --verify
 *
 * AFTER RUNNING:
 *   Copy the deployed address from the output and set it as
 *   NEXT_PUBLIC_CONTRACT_ADDRESS in Vercel production environment variables.
 */
contract DeployMainnet is Script {
    // Arc Mainnet USDC — the ERC-20 interface for Arc's native USDC asset.
    // This address is the same on Arc Mainnet (5042) and Arc Testnet (5042002) by design.
    // Verified at: https://docs.arc.io/arc/references/contract-addresses
    address constant USDC_MAINNET = 0x3600000000000000000000000000000000000000;

    // The v13 contract is already deployed at this address by the project owner.
    // This script is retained for future redeployments only.
    // Current mainnet address: 0xbb1f1e47900a966a12250c1dc0c9fe325f1caebf
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("USDC:", USDC_MAINNET);
        console.log("Chain ID:", block.chainid);
        require(block.chainid == 5042, "Wrong chain: must be Arc Mainnet (5042)");

        vm.startBroadcast(deployerKey);
        AdasheCircle circle = new AdasheCircle(USDC_MAINNET);
        vm.stopBroadcast();

        console.log("AdasheCircle deployed at:", address(circle));
        console.log("Set NEXT_PUBLIC_CONTRACT_ADDRESS =", address(circle));
    }
}
