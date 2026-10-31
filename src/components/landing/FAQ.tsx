'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'

const faqs = [
  {
    q: 'Will I get my reserve back?',
    a: 'Yes — your reserve is returned to you automatically when the circle completes and all obligations are settled. If you repay any debt you accumulated during the circle, the reserve is also restored. The contract holds it in escrow; no one can take it.',
  },
  {
    q: 'What if someone receives their payout and then stops contributing?',
    a: 'Their reserve covers the first missed payment. After that, any shortfall is recorded as debt. That debt must be cleared before their wallet can be approved to join a future circle, and it is permanently visible on-chain. The remaining members still receive their payouts — the circle continues.',
  },
  {
    q: 'What if someone refuses to contribute before it is their turn to receive?',
    a: 'Same as above: their reserve covers one miss, then debt accrues. Critically, outstanding debt blocks their own payout. When their turn comes, the contract withholds their payout until all debt is cleared. If the circle completes and the debt is never cleared, the withheld payout is locked and the other contributors can reclaim their contributions for that period.',
  },
  {
    q: 'What is the grace period?',
    a: 'After the contribution deadline passes, a grace period opens during which late members can still pay without being defaulted. The length depends on the circle frequency: 12 hours for daily, 3 days for weekly, and 10 days for monthly circles. Once grace expires without payment, the member is marked as defaulted for that period.',
  },
  {
    q: 'What happens when someone misses a payment and has no reserve left?',
    a: 'If a member has already exhausted their reserve from a previous default, the shortfall is still recorded as creditor debt — money owed directly to the period recipient. The period finalises with a reduced payout to the recipient. The debtor must repay before receiving their own payout.',
  },
  {
    q: 'Can the creator steal the funds?',
    a: 'No. The creator coordinates the circle — they set the rules at creation and can invite or remove pending members — but they cannot redirect contributions, cancel an active circle, or touch funds held for other members. The smart contract enforces every rule. Even the creator is subject to the same default and reserve logic as everyone else.',
  },
  {
    q: 'What if I need to leave the circle early?',
    a: 'There is no early exit once a circle is active. This mirrors how traditional rotating savings work: the commitment is the point. If you have already received your payout you still owe contributions for every remaining period. If you have not yet received, your reserve stays locked until the circle completes or your payout is released.',
  },
  {
    q: 'What happens if the circle never completes — can I get contributions back?',
    a: 'If a recipient refuses to clear their debt and the circle completes with a permanently withheld payout, every contributor to that withheld period can reclaim their individual contribution from the contract. The recipient cannot claim that refund — only the contributors who paid in.',
  },
  {
    q: 'How does debt affect a member\'s own payout turn?',
    a: 'Outstanding debt blocks payout claims entirely. When your period arrives, the contract checks your debt balance. If it is above zero, the claim button is hidden and a warning is shown. You must repay all debt first. Once cleared, you can claim. If you clear debt by the time your period finalises, the payout releases normally.',
  },
  {
    q: 'Is Adashe audited?',
    a: 'An internal security review has been completed and two critical vulnerabilities were identified and fixed before mainnet deployment. A formal third-party audit has not yet been completed. You should treat this as an early-stage product and not commit funds you cannot afford to lose until an independent audit is published.',
  },
]

interface FAQItemProps {
  q: string
  a: string
  isOpen: boolean
  onToggle: () => void
  index: number
}

function FAQItem({ q, a, isOpen, onToggle, index }: FAQItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-ivory-300 last:border-0"
    >
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 py-5 text-left min-h-[56px] group"
        aria-expanded={isOpen}
      >
        <span className="font-display font-semibold text-forest-500 text-base leading-snug group-hover:text-terra-400 transition-colors text-pretty">
          {q}
        </span>
        <span className="shrink-0 rounded-full bg-ivory-200 group-hover:bg-terra-50 transition-colors p-1 mt-0.5">
          {isOpen
            ? <Minus className="h-3.5 w-3.5 text-terra-400" />
            : <Plus className="h-3.5 w-3.5 text-forest-400" />
          }
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="text-sm text-muted leading-relaxed text-pretty pb-5 max-w-2xl">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i)

  return (
    <section className="py-20 px-4 sm:px-6 bg-ivory-50">
      <div className="mx-auto max-w-3xl">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-forest-500 tracking-tighter text-balance">
            Common questions
          </h2>
          <p className="text-muted text-lg mt-3 text-pretty">
            Real answers about how the mechanics work.
          </p>
        </motion.div>

        <div className="card p-2 sm:p-4 divide-y-0">
          {faqs.map((faq, i) => (
            <FAQItem
              key={i}
              q={faq.q}
              a={faq.a}
              isOpen={openIndex === i}
              onToggle={() => toggle(i)}
              index={i}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
