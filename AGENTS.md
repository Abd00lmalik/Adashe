# Adashe Onchain — Agent Memory

## Deployed Contracts

| Contract | Chain | Address | Tx Hash | Explorer |
|---|---|---|---|---|
| AdasheCircle | Arc Testnet | `0xf230a4353bf45b2d43f79d1803868ad8c8e49018` | `0xb4b6bbbaa6f01c191b44021028a23ec18933751899e842b686fe5f70cbf0d7e5` | [View](https://explorer.testnet.arc.io/address/0xf230a4353bf45b2d43f79d1803868ad8c8e49018) |

## Network Configuration

- **Chain:** Arc Testnet (Chain ID: 5042002)
- **USDC:** `0x3600000000000000000000000000000000000000` (6 decimals, ERC-20 view)
- **RPC:** `https://rpc.testnet.arc.io`
- **Explorer:** `https://explorer.testnet.arc.io`
- **Deployed:** 2026-10-17

## Source Files

| File | Description |
|---|---|
| `contracts/AdasheCircle.sol` | Main contract |
| `contracts/test/AdasheCircle.t.sol` | Foundry unit tests (41 tests, all pass) |
| `contracts/contract-metadata/AdasheCircle.json` | Deployment metadata |
| `contracts/out/AdasheCircle.sol/AdasheCircle.json` | Compiled artifact |
| `foundry.toml` | Foundry config (Paris EVM, OZ 5.1.0) |
| `init.md` | Full product specification |

## Constructor Args

```
AdasheCircle(address usdcAddress)
usdcAddress = 0x3600000000000000000000000000000000000000
```
