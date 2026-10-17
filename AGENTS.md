# Adashe Onchain — Agent Memory

## Deployed Contracts

| Contract | Chain | Address | Tx Hash | Explorer |
|---|---|---|---|---|
| AdasheCircle v2 (current) | Arc Testnet | `0xa61aeab00c4b761f79bb8a22b6e167d28e37cfbd` | `0x546ea5b254c27c2f7a82c7963426a525dc63daead6d5386bcb9b24ad6b504d98` | [View](https://explorer.testnet.arc.io/address/0xa61aeab00c4b761f79bb8a22b6e167d28e37cfbd) |
| AdasheCircle v1 (superseded) | Arc Testnet | `0xf230a4353bf45b2d43f79d1803868ad8c8e49018` | `0xb4b6bbbaa6f01c191b44021028a23ec18933751899e842b686fe5f70cbf0d7e5` | [View](https://explorer.testnet.arc.io/address/0xf230a4353bf45b2d43f79d1803868ad8c8e49018) |

## Network Configuration

- **Chain:** Arc Testnet (Chain ID: 5042002)
- **USDC:** `0x3600000000000000000000000000000000000000` (6 decimals, ERC-20 view)
- **RPC:** `https://rpc.testnet.arc.io`
- **Explorer:** `https://explorer.testnet.arc.io`
- **v2 Deployed:** 2026-10-17T19:16:07Z (contract ID: 01a14b4a-e9a5-7042-9cff-5352b0115d8a)
- **v1 Deployed:** 2026-10-17T18:29:15Z (superseded — do not use)

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
