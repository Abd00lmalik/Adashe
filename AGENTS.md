# Adashe Onchain — Agent Memory

## Deployed Contracts

| Contract | Chain | Address | Tx Hash | Explorer |
|---|---|---|---|---|
| AdasheCircle v4 (current) | Arc Testnet | `0xcd7c871f4d0ce61ef2c90f12d2b0384299134784` | `0x2b0ff88ca4220b9babeafd82e270804334d0e1a54f52b89a049e43ec3ac425df` | [View](https://explorer.testnet.arc.io/address/0xcd7c871f4d0ce61ef2c90f12d2b0384299134784) |
| AdasheCircle v3 (superseded) | Arc Testnet | `0x20c9fc1e5062df4702798a57b2535bf429b0c912` | `0x8dd1113249fe079822c2af9df9f85335e185b8f53762c99669a874da774c2c84` | [View](https://explorer.testnet.arc.io/address/0x20c9fc1e5062df4702798a57b2535bf429b0c912) |
| AdasheCircle v2 (superseded) | Arc Testnet | `0xa61aeab00c4b761f79bb8a22b6e167d28e37cfbd` | `0x546ea5b254c27c2f7a82c7963426a525dc63daead6d5386bcb9b24ad6b504d98` | [View](https://explorer.testnet.arc.io/address/0xa61aeab00c4b761f79bb8a22b6e167d28e37cfbd) |
| AdasheCircle v1 (superseded) | Arc Testnet | `0xf230a4353bf45b2d43f79d1803868ad8c8e49018` | `0xb4b6bbbaa6f01c191b44021028a23ec18933751899e842b686fe5f70cbf0d7e5` | [View](https://explorer.testnet.arc.io/address/0xf230a4353bf45b2d43f79d1803868ad8c8e49018) |

## Network Configuration

- **Chain:** Arc Testnet (Chain ID: 5042002)
- **USDC:** `0x3600000000000000000000000000000000000000` (6 decimals, ERC-20 view)
- **RPC:** `https://rpc.testnet.arc.io`
- **Explorer:** `https://explorer.testnet.arc.io`
- **v4 Deployed:** 2026-10-18T19:04:24Z (contract ID: 01a15066-9568-749f-b004-ef9af0d4b387)
- **v3 Deployed:** 2026-10-18T18:50:32Z (superseded — do not use)
- **v2 Deployed:** 2026-10-17T19:16:07Z (superseded — do not use)
- **v1 Deployed:** 2026-10-17T18:29:15Z (superseded — do not use)

## Source Files

| File | Description |
|---|---|
| `contracts/AdasheCircle.sol` | Main contract |
| `contracts/test/AdasheCircle.t.sol` | Foundry unit tests (44 tests, all pass) |
| `contracts/contract-metadata/AdasheCircle.json` | Deployment metadata |
| `contracts/out/AdasheCircle.sol/AdasheCircle.json` | Compiled artifact |
| `foundry.toml` | Foundry config (Paris EVM, OZ 5.1.0) |
| `init.md` | Full product specification |

## Constructor Args

```
AdasheCircle(address usdcAddress)
usdcAddress = 0x3600000000000000000000000000000000000000
```
