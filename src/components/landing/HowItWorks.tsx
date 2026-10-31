'use client'

import { UserPlus, HandCoins, RotateCcw, Bell } from 'lucide-react'
import { motion } from 'framer-motion'

const steps = [
  {
    icon: UserPlus,
    number: '01',
    title: 'Form your circle',
    description:
      'A creator sets the group size, contribution amount, and schedule. Each member is invited privately via a unique link. No public directory, no open joining.',
  },
  {
    icon: HandCoins,
    number: '02',
    title: 'Everyone contributes',
    description:
      'Each period, all members except the scheduled recipient contribute the fixed USDC amount. The contract collects and holds the funds on-chain — no one can touch them early.',
  },
  {
    icon: RotateCcw,
    number: '03',
    title: 'Receive your turn',
    description:
      'The scheduled recipient claims their payout. One contribution is withheld as their reserve for future obligations. The rotation continues until every member has received.',
  },
  {
    icon: Bell,
    number: '04',
    title: 'The contract keeps score',
    description:
      'Missed payments trigger a grace period. If unpaid, the defaulter\'s reserve covers the shortfall and they accrue debt. The creator sees all defaults. Debt blocks a member\'s own payout until cleared.',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-forest-500 tracking-tighter text-balance">
            How Adashe works
          </h2>
          <p className="text-muted text-lg mt-3 max-w-2xl mx-auto text-pretty">
            Rotating savings (also known as tontine, susu, hui, or chama) is a trusted practice
            in communities worldwide. Adashe brings it onchain.
          </p>
        </motion.div>

        <motion.div
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.number}
                variants={cardVariants}
                className="card p-6 group hover:shadow-float transition-shadow duration-300"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="rounded-xl bg-forest-500 p-2.5 shrink-0 group-hover:bg-terra-400 transition-colors duration-300">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="font-mono text-terra-300 font-medium text-sm">
                    {step.number}
                  </span>
                </div>
                <h3 className="font-display font-semibold text-forest-500 text-lg mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed text-pretty">
                  {step.description}
                </p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
