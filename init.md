# INIT.MD — ADASHE ONCHAIN
## Product Specification, Business Rules, and Implementation Directives

### 1. ROLE AND WORKING APPROACH

You are the engineering agent responsible for building this project.

Your task is to implement a reliable, usable, and well-tested onchain rotating savings application inspired by Adashe, the traditional rotating savings practice common in Nigeria and other communities.

Do not begin coding blindly.

First:
1. Inspect the repository, existing application, dependencies, architecture, and documentation.
2. Inspect the available Arc Studio environment and its current development workflow.
3. Identify what already works and what needs to be built.
4. Review this specification and identify accounting ambiguities, security concerns, and technical constraints.
5. Present a concise implementation plan before making substantial architectural changes.

Preserve working functionality where possible. Do not replace the existing stack or introduce unnecessary infrastructure without a clear reason.

Do not silently change the business rules defined here. If a rule is ambiguous, contradictory, or impossible to implement safely, explain the problem and propose a solution before proceeding.

The human developer directs the project. You are responsible for implementation, testing, and reporting accurately on progress.

---

### 2. PROJECT VISION

Build a private, invitation-based application that allows groups of people to run rotating savings circles using USDC on Arc.

Traditional Adashe allows a group of people to contribute a fixed amount periodically, with a different member receiving the pooled contributions each period.

This application brings that arrangement onchain.

The smart contract must enforce contribution accounting, payout eligibility, reserve management, approved extensions, position swaps, and settlement rules.

The application must not depend on the circle creator being able to withdraw, redirect, or manually distribute escrowed funds.

The central principle is:

**The creator coordinates the circle. The smart contract governs the money.**

The product should be understandable to people familiar with traditional Adashe without requiring them to understand smart contracts.

Do not turn this into a generic DeFi dashboard, lending protocol, yield product, or speculative investment application.

The core product is a rotating savings system.

---

### 3. REQUIRED TECHNOLOGY AND DEPLOYMENT CONTEXT

This project is being developed for the Arc Microgrants: Built with Arc Studio initiative.

Requirements:
- Use Arc Studio as required by the initiative.
- Develop and test smart contracts using Arc Studio.
- Deploy the required contracts to Arc mainnet.
- Use USDC for circle contributions, reserves, payouts, and settlements.
- Deliver a functional frontend connected to the deployed contracts.
- Ensure at least one real USDC transaction occurs on Arc mainnet as required by the initiative.
- Maintain a public source-code repository.
- Document the deployed contract addresses and relevant transaction hashes.
- Provide a working application URL and walkthrough video.

Verify the current Arc mainnet configuration, USDC contract address, Arc Studio requirements, and deployment process from authoritative documentation before implementation.

Never assume that a testnet address, token address, RPC endpoint, or chain configuration is valid for mainnet.

Never represent testnet activity as mainnet activity.

Keep development, testing, and production configurations separate.

Do not use mock transactions to claim that the mainnet transaction requirement has been satisfied.

---

### 4. CORE TERMINOLOGY

Use these definitions consistently throughout the codebase, interface, events, and documentation.

**Circle:** A group of approved members participating in a rotating savings arrangement.

**Creator:** The member who creates and coordinates a circle.

**Member:** An approved participant in a circle.

**Contribution:** The fixed USDC amount a member is required to pay toward another member's scheduled payout.

**Recipient:** The member scheduled to receive the pooled contributions for a particular cycle.

**Payout:** The funds allocated to a scheduled recipient after applying the circle's rules.

**Reserve:** Funds withheld from a member's payout to provide protection against an eligible future contribution shortfall.

**Outstanding debt:** An amount a member was required to contribute but has not paid and that has not been formally settled under the contract's rules.

**Uncompensated loss:** An amount a member is still owed after accounting for actual payments and any reserve coverage or other valid compensation already received.

**Withheld payout:** A scheduled payout that the contract has not released because the recipient is ineligible, including because of outstanding debt.

**Grace period:** The agreed period following a contribution deadline during which a late payment may still be accepted before the applicable default rules take effect.

**Approved extension:** A formally recorded change to a contribution deadline approved by the relevant recipient. An extension is not a payment.

These concepts must not be conflated in the contract's accounting.

In particular:
- Debt is not the same as uncompensated loss.
- Reserve coverage does not automatically erase the defaulter's debt.
- An approved extension does not count as payment.
- A withheld payout is not automatically available for unrestricted redistribution.
- Funds must never be allocated twice.

---

### 5. CIRCLE CREATION AND MEMBERSHIP

A user must be able to create a circle and configure its rules.

At minimum, configuration must cover:
- Circle name.
- Fixed contribution amount.
- Contribution frequency.
- Number of members.
- Scheduled payout order.
- Contribution deadline for each period.
- Grace period.
- Reserve policy.
- Membership invitation and approval process.

Use USDC as the contribution and payout asset.

The creator must establish the payout order when configuring the circle.

The application must validate the configuration before allowing the circle to begin.

Examples of invalid configurations include:
- An invalid number of members.
- Duplicate payout positions.
- Missing payout positions.
- An impossible payout schedule.
- Zero or invalid contribution amounts.
- A schedule that cannot be reconciled with the circle's accounting rules.

The creator must be able to invite people using a private invitation link.

The creator may set a PIN associated with access to the circle.

Joining must follow the circle's configured membership approval process.

Do not implement a public directory that allows arbitrary users to discover and freely join private circles.

The creator is responsible for selecting suitable participants.

Do not introduce mandatory identity verification or KYC as a default requirement.

However, explain the limits of privacy accurately. An invitation link and PIN can restrict access through the application, but they do not make blockchain transactions, wallet addresses, or publicly stored contract data confidential.

Never store plaintext PINs in smart contracts or public blockchain storage.

Implement reasonable protection against brute-force PIN guessing and unauthorized access in the application.

Do not treat a PIN as a substitute for wallet authorization.

Membership and payout permissions must be enforced by the smart contract where appropriate, not merely by hiding buttons in the frontend.

---

### 6. CONTRIBUTION AND PAYOUT MODEL

The circle follows a rotating payout model.

The scheduled recipient does not contribute toward their own payout during that payout period.

All other members are expected to contribute the agreed fixed amount.

For a circle with five members:
- Members: A, B, C, D, E.
- Contribution per member: 250 USDC.
- Payout order: A, B, C, D, E.
- Each scheduled recipient receives contributions from the other four members.
- Expected gross payout: 1,000 USDC.

The gross payout is calculated as:

GROSS_PAYOUT = CONTRIBUTION_AMOUNT × (MEMBER_COUNT - 1)

This formula applies to the agreed model in which the scheduled recipient does not contribute during their own payout period.

The reserve is withheld from the gross payout according to the reserve rules.

For example, with a 1,000 USDC gross payout and a 250 USDC reserve:
- Gross payout: 1,000 USDC.
- Reserve withheld: 250 USDC.
- Initial payout amount before other eligibility checks: 750 USDC.

Do not release the payout until the contract verifies that the recipient is eligible.

The contract must account for the actual USDC received. Never assume that a contribution was paid because the frontend submitted a transaction or displayed a success message.

A contribution is paid only when the contract has verified receipt of the expected USDC amount.

Do not use floating-point arithmetic for token balances. Use the token's integer units and explicit precision handling.

---

### 7. CONTRIBUTION DEADLINES AND GRACE PERIODS

Each contribution must have a defined deadline.

A member may pay before the deadline or during the grace period.

The agreed grace period is 10 days after the original deadline unless a valid extension changes that deadline.

The contract must distinguish:
- Pending contribution.
- Paid contribution.
- Late payment.
- Approved extension.
- Defaulted contribution.
- Contribution covered by reserve.
- Outstanding debt.

A contribution must not be marked paid merely because:
- A member requested an extension.
- The recipient approved an extension.
- A transaction was submitted but reverted.
- A wallet balance was checked.
- The frontend received an unverified success response.

When a member pays a valid outstanding contribution, the contract must record the actual payment and allocate the funds according to the circle's rules.

The contract must enforce the deadline and grace period rules without relying on the frontend or the creator to trigger enforcement.

---

### 8. PERSISTENT CONTEXT (from uploaded context file)

## Purpose and instructions
Adashe Onchain is a private, invitation-based Nigerian Adashe-inspired savings circle using USDC on Arc. The creator coordinates; the contract governs funds.

**This is persistent context, not a build prompt.** It does not authorize coding/deployment. Implement only when explicitly asked; inspect the existing repository, contracts, app, and tests first.

**Deployment:** Arc Studio/testnet first. Mainnet and real-USDC transactions require explicit authorization. Never fabricate results. Do not reconfirm settled rules or invent contradictory scenarios; ask only about necessary unresolved details and flag real conflicts.

## Product and circle lifecycle
- Each circle has fixed capacity, contribution, payout order, frequency, and schedule. Creator sets terms, invites/approves members, and coordinates permitted changes.
- No public discovery/open joining: invitation link + PIN + creator approval. Never store plaintext PIN onchain; PIN is not wallet authorization. No mandatory KYC. Do not claim onchain activity is private or anonymous.
- A circle starts automatically when all positions are filled and every member is approved. No separate manual start action. Before start, removal leaves the circle pending until a replacement is approved and all positions are filled and approved. Contributions begin only when the circle starts.
- A started circle cannot be cancelled and must complete its rotation.
- Members cannot voluntarily leave an active circle. Only the creator can initiate removal under the rules below. Once full, no one can independently join; only the creator can approve a replacement.

## Contributions and payouts
Each period has one recipient, who does not contribute that period; every other member contributes the fixed amount. Example: five members × 250 USDC yields the recipient 1,000 USDC gross (four contributions), before reserve and eligibility rules.

- The first contribution is due immediately when the circle starts. Later periods follow the selected weekly or monthly schedule.
- Any outstanding debt, even 0.1 USDC, makes a member ineligible for their scheduled payout. **Their entire payout stays withheld in the contract until their debt is cleared.** Do not partially release it, skip them, or redirect it to another member while debt remains.
- Clearing debt restores eligibility subject to other contract rules. Removal/replacement never lets a member escape obligations.

## Individual reserves
- Each member has an individual reserve; reserves are never pooled.
- Reserve comes from withholding the agreed amount from that member's payout (e.g. 1,000 gross minus 250 reserve = 750 releasable if eligible).
- Reserve secures its owner's next-period contribution. If the owner misses a contribution owed to the current recipient, their reserve may cover their shortfall only after the 10-day grace period and any approved extension expire.
- Example: B misses 250 USDC owed to C. At the final applicable deadline, B's reserve may pay C for B's shortfall. Only B's reserve may cover B's default; never use another member's reserve or funds.
- Reserve coverage protects the recipient but does not erase debt. Track reserve use separately from debt and actual payments; never double-count.
- If the responsible member's reserve is insufficient, apply only the eligible amount available from that reserve and record the uncovered remainder under debt rules. Never take the remainder from another member.
- Unused reserve is returned to its owner at final settlement. It cannot cover another member's debt or loss. Track ownership, balance, deductions, and refunds per wallet.

## Grace period and extensions
- Each contribution has a 10-day grace period.
- A member may request an extension from the relevant recipient, who approves/rejects it. Reserve coverage waits until the approved extended deadline expires.
- An extension is not payment, does not clear debt, and does not change unrelated obligations. Record it audibly.

## Debt and financial accountability
- Debt stays with the wallet that incurred it; removal/replacement never erases it.
- Any debt blocks the debtor's entire scheduled payout until cleared.
- At final settlement, the contract may deduct debt from that same member's own eligible withheld payout and return the remainder. Example: D has 1,000 USDC of their own withheld payout and 250 USDC of their own debt; if eligible, 250 settles D's debt and 750 returns to D.
- Never use another member's funds to settle debt. If the debtor's eligible funds are insufficient, preserve the balance.
- For post-payout default, record debt and alert the creator for offchain follow-up; the contract cannot force an unauthorized transfer and the creator cannot seize funds.

## Final settlement and accounting
Settlement uses only funds actually held. It cannot assume new payments, pool property, or make one member pay another's debt.
1. Return each member's unused reserve to that member.
2. Use a member's own eligible withheld payout or other eligible funds only for that member's own obligations.
3. Assign documented loss, compensation, debt settlement, and surplus to the correct responsible wallet and rightful recipient. Never compensate the same loss twice.
4. If a member's eligible funds are insufficient, preserve their unpaid obligation in the ledger.
5. Never allocate more than the contract's actual token balance, double-count funds, or record a transfer that did not happen.

Keep separate auditable ledgers for contributions, reserves, payout entitlements/releases/withholdings, debt, reserve coverage, compensation, deductions, and refunds. Distinguish debt, reserve use, and actual payment in UI/events.

## Active-member replacement
- Creator must approve the replacement before removing an active member, preserving the position and schedule.
- An active member with any outstanding debt cannot be removed. Their debt must be settled first; replacement approval alone is insufficient.
- After valid removal, the replacement assumes the remaining scheduled position and future contribution obligations from the recorded effective transition date.
- Removed member retains their debt, reserve, withheld payout, and transaction history; replacement inherits none.
- Record the transition; prevent duplicate charges/payouts. Creator cannot change financial ownership or erase liabilities.

## Schedule
The creator chooses **weekly** or **monthly** when creating the circle.
- **Weekly:** Creator selects a recurring weekday. First contribution is due immediately at circle start; later periods follow that weekday.
- **Monthly:** First contribution is due immediately at circle start; later periods follow a calendar-month schedule. If the anchor day does not exist, use that month's last calendar day. Example: an anchor on the 31st uses February's last day, returns to 31 March, and uses 30 April. Handle leap years deterministically; the creator cannot arbitrarily change deadlines after start.
- Grace and extension rules apply to each deadline; avoid ambiguous or duplicate periods.

## Creator powers and limits
Creator may set terms, invite/approve members, approve valid replacements, take permitted membership actions, receive alerts, and follow up offchain after post-payout default.

Creator cannot withdraw/redirect escrow, spend another's reserve or withheld payout, override eligibility, release a blocked payout, erase debt, falsify payment, cancel a started circle, remove an indebted active member, or replace someone before approval and debt settlement. Creator powers are operational, not control over funds.

## Security and implementation requirements
- PIN is app-level access control, not financial authorization. Never store it plaintext onchain; protect/rate-limit attempts. Wallet signatures authorize actions.
- Contract is source of truth for balances, contributions, debt, deadlines, reserves, positions, and eligibility; frontend cannot override it.
- Validate financial transitions onchain; use safe transfers, access control, replay/reentrancy protection as relevant. No admin backdoor may withdraw/redirect funds, erase unsettled debt, or bypass restrictions.
- Before implementation, turn these rules into contract invariants and tests: no payout to a debtor; full payout withheld while debt exists; only the defaulter's reserve covers their missed contribution; no cross-member debt settlement; unused reserves return to owners; no cancellation after start; no voluntary exit; replacement requires approval and zero outgoing debt; no duplicate charges/payouts; correct weekly/monthly dates; grace/extension handling; and allocations never exceed actual holdings.

## Build guardrails
Context is not authorization to code. If asked to implement, inspect the current project first. Use Arc Studio/testnet; mainnet requires explicit approval. Any future app/repo/address/transaction/video deliverables must be real, never fabricated.

## Details not yet specified
Do not invent these; ask only if needed:
- Reserve amount/formula and cap.
- Calendar-day and timestamp/time-zone convention for deadlines.
- Effect of fully/partly used reserve on the owner's next-period contribution, distinct from debt clearance.
- Definition/evidence standard for documented loss and compensation.
- Whether fees exist and their amount, recipient, and timing.
- Remaining active-replacement details.

Do not reopen settled rules.
