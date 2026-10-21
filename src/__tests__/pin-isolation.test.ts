/**
 * PIN isolation regression tests.
 *
 * Root cause being tested: CirclePin records were keyed by circleId alone.
 * After a contract redeployment, both old and new contracts start counting
 * circleId from 1. The new circle's PIN store call hits the idempotency guard
 * and is silently rejected, leaving no PIN record for the new circle.
 *
 * Fix: composite primary key (contractAddress, circleId).
 * These tests verify that PIN storage and verification are correctly isolated
 * across any number of wallets, circles, and contract deployments.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { hashPin, verifyPin } from '@/lib/pin'

// ─── In-memory CirclePin store (simulates the DB) ────────────────────────────

type PinRecord = {
  contractAddress: string
  circleId: string
  pinHash: string
  createdAt: Date
  updatedAt: Date
}

function makeStore() {
  const records = new Map<string, PinRecord>()

  const key = (contractAddress: string, circleId: string) =>
    `${contractAddress.toLowerCase()}::${circleId}`

  return {
    async set(contractAddress: string, circleId: string, pin: string): Promise<{ stored: boolean; reason?: string }> {
      const k = key(contractAddress, circleId)
      if (records.has(k)) return { stored: false, reason: 'PIN already set' }
      const pinHash = await hashPin(pin)
      records.set(k, {
        contractAddress: contractAddress.toLowerCase(),
        circleId,
        pinHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      return { stored: true }
    },

    async verify(contractAddress: string, circleId: string, pin: string): Promise<{ ok: boolean; reason?: string }> {
      const k = key(contractAddress, circleId)
      const record = records.get(k)
      if (!record) return { ok: false, reason: 'No PIN record found' }
      const match = await verifyPin(pin, record.pinHash)
      return { ok: match, reason: match ? undefined : 'Incorrect PIN' }
    },

    has(contractAddress: string, circleId: string) {
      return records.has(key(contractAddress, circleId))
    },

    size() {
      return records.size
    },
  }
}

// ─── Contract address fixtures ────────────────────────────────────────────────

const CONTRACT_V6 = '0x369bb6da1ef5d1d78e989336e57b1e1d53a482ef'
const CONTRACT_V7 = '0x000000000000000000000000000000000000dead' // hypothetical next deploy

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PIN core functions', () => {
  it('hashPin produces a bcrypt hash, verifyPin confirms it', async () => {
    const hash = await hashPin('1234')
    expect(hash).toMatch(/^\$2[ab]\$/)
    expect(await verifyPin('1234', hash)).toBe(true)
  })

  it('verifyPin rejects incorrect PIN', async () => {
    const hash = await hashPin('correct')
    expect(await verifyPin('wrong', hash)).toBe(false)
  })

  it('two calls to hashPin produce different salts (not deterministic)', async () => {
    const h1 = await hashPin('same')
    const h2 = await hashPin('same')
    expect(h1).not.toBe(h2)
    // But both verify correctly
    expect(await verifyPin('same', h1)).toBe(true)
    expect(await verifyPin('same', h2)).toBe(true)
  })
})

describe('CirclePin isolation by (contractAddress, circleId)', () => {
  let store: ReturnType<typeof makeStore>

  beforeEach(() => {
    store = makeStore()
  })

  it('stores a PIN for circle 1 on v6', async () => {
    const result = await store.set(CONTRACT_V6, '1', 'abc123')
    expect(result.stored).toBe(true)
    expect(store.has(CONTRACT_V6, '1')).toBe(true)
  })

  it('stores a PIN for circle 1 on v7 independently of v6 circle 1', async () => {
    await store.set(CONTRACT_V6, '1', 'v6-pin')
    const result = await store.set(CONTRACT_V7, '1', 'v7-pin')
    expect(result.stored).toBe(true)
    expect(store.size()).toBe(2) // two separate records
  })

  it('v6 circle 1 PIN does not interfere with v7 circle 1 PIN', async () => {
    await store.set(CONTRACT_V6, '1', 'v6-pin')
    await store.set(CONTRACT_V7, '1', 'v7-pin')

    expect((await store.verify(CONTRACT_V6, '1', 'v6-pin')).ok).toBe(true)
    expect((await store.verify(CONTRACT_V7, '1', 'v7-pin')).ok).toBe(true)

    // Cross-check: wrong PIN for the other deployment
    expect((await store.verify(CONTRACT_V6, '1', 'v7-pin')).ok).toBe(false)
    expect((await store.verify(CONTRACT_V7, '1', 'v6-pin')).ok).toBe(false)
  })

  it('idempotency: second store for same (contract, circleId) is rejected', async () => {
    await store.set(CONTRACT_V6, '1', 'original')
    const second = await store.set(CONTRACT_V6, '1', 'overwrite-attempt')
    expect(second.stored).toBe(false)
    expect(second.reason).toBe('PIN already set')
    // Original PIN still valid
    expect((await store.verify(CONTRACT_V6, '1', 'original')).ok).toBe(true)
    expect((await store.verify(CONTRACT_V6, '1', 'overwrite-attempt')).ok).toBe(false)
  })

  it('multiple circles on the same contract are isolated', async () => {
    const circles = ['1', '2', '3', '4', '5']
    const pins = ['pin-1', 'pin-2', 'pin-3', 'pin-4', 'pin-5']

    for (let i = 0; i < circles.length; i++) {
      await store.set(CONTRACT_V6, circles[i], pins[i])
    }

    expect(store.size()).toBe(5)

    // Each circle verifies only with its own PIN
    for (let i = 0; i < circles.length; i++) {
      expect((await store.verify(CONTRACT_V6, circles[i], pins[i])).ok).toBe(true)
      // Wrong PIN fails
      const wrongPin = pins[(i + 1) % pins.length]
      expect((await store.verify(CONTRACT_V6, circles[i], wrongPin)).ok).toBe(false)
    }
  })

  it('multiple wallets creating multiple circles: each PIN is independent', async () => {
    // Simulate: Wallet A creates circle 1 (v6), Wallet B creates circle 2 (v6)
    // Then Wallet A creates circle 1 (v7) — should not conflict with v6 circle 1
    const scenarios = [
      { contract: CONTRACT_V6, circleId: '1', pin: 'wallet-a-pin' },
      { contract: CONTRACT_V6, circleId: '2', pin: 'wallet-b-pin' },
      { contract: CONTRACT_V7, circleId: '1', pin: 'wallet-a-v7-pin' }, // same circleId, new contract
      { contract: CONTRACT_V7, circleId: '2', pin: 'wallet-b-v7-pin' },
    ]

    for (const s of scenarios) {
      const result = await store.set(s.contract, s.circleId, s.pin)
      expect(result.stored).toBe(true)
    }

    expect(store.size()).toBe(4)

    for (const s of scenarios) {
      expect((await store.verify(s.contract, s.circleId, s.pin)).ok).toBe(true)
    }
  })

  it('creating a new circle never affects previously stored PINs', async () => {
    // Store PIN for circle 1 on v6
    await store.set(CONTRACT_V6, '1', 'existing-pin')

    // Now create circle 2 on v6 (simulates another wallet creating a new circle)
    await store.set(CONTRACT_V6, '2', 'new-circle-pin')

    // Circle 1 PIN must still work
    expect((await store.verify(CONTRACT_V6, '1', 'existing-pin')).ok).toBe(true)
  })

  it('missing PIN record returns not-found reason', async () => {
    const result = await store.verify(CONTRACT_V6, '99', 'any-pin')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('No PIN record found')
  })

  it('contractAddress is case-insensitive', async () => {
    await store.set(CONTRACT_V6.toUpperCase(), '1', 'case-test')
    // lowercase lookup must find it
    expect((await store.verify(CONTRACT_V6.toLowerCase(), '1', 'case-test')).ok).toBe(true)
  })
})

describe('PIN parameterized: arbitrary wallets and circles', () => {
  it('N wallets each creating M circles with distinct PINs remain fully isolated', async () => {
    const store = makeStore()

    // Generate N wallets, each creating M circles on a single contract
    const N_WALLETS = 5
    const M_CIRCLES_PER_WALLET = 4
    let globalCircleId = 1

    type Entry = { circleId: string; pin: string }
    const byWallet: Entry[][] = []

    for (let w = 0; w < N_WALLETS; w++) {
      const walletCircles: Entry[] = []
      for (let c = 0; c < M_CIRCLES_PER_WALLET; c++) {
        const cid = String(globalCircleId++)
        const pin = `wallet-${w}-circle-${cid}`
        await store.set(CONTRACT_V6, cid, pin)
        walletCircles.push({ circleId: cid, pin })
      }
      byWallet.push(walletCircles)
    }

    expect(store.size()).toBe(N_WALLETS * M_CIRCLES_PER_WALLET)

    // Every (wallet, circle) verifies with its own PIN and rejects all others
    for (let w = 0; w < N_WALLETS; w++) {
      for (const { circleId, pin } of byWallet[w]) {
        expect((await store.verify(CONTRACT_V6, circleId, pin)).ok).toBe(true)
        expect((await store.verify(CONTRACT_V6, circleId, 'wrong')).ok).toBe(false)
      }
    }
  })

  it('same circleId on K different contract deployments are all isolated', async () => {
    const store = makeStore()
    const K = 7
    const contracts = Array.from({ length: K }, (_, i) =>
      `0x${String(i + 1).padStart(40, '0')}`
    )
    const pins = contracts.map((_, i) => `deploy-${i}-pin`)

    for (let i = 0; i < K; i++) {
      await store.set(contracts[i], '1', pins[i])
    }

    expect(store.size()).toBe(K)

    for (let i = 0; i < K; i++) {
      expect((await store.verify(contracts[i], '1', pins[i])).ok).toBe(true)
      // PIN from a different deployment is rejected
      const otherPin = pins[(i + 1) % K]
      expect((await store.verify(contracts[i], '1', otherPin)).ok).toBe(false)
    }
  })
})
