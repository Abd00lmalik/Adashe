import { UserPlus, HandCoins, RotateCcw } from 'lucide-react'
import { ScrollReveal } from '@/components/ui/ScrollReveal'

const steps = [
  {
    icon: UserPlus,
    number: '01',
    title: 'Form your circle',
    description:
      'A creator sets the group size, contribution amount, and schedule. Each member is invited privately. No public directory, no open joining.',
  },
  {
    icon: HandCoins,
    number: '02',
    title: 'Everyone contributes',
    description:
      'Each period, all members except the scheduled recipient contribute the fixed amount in USDC. The contract collects and holds the funds.',
  },
  {
    icon: RotateCcw,
    number: '03',
    title: 'Receive your turn',
    description:
      'The recipient for that period claims their payout (minus a reserve withheld for their future obligations). The rotation continues until everyone has received.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-forest-500 tracking-tighter text-balance">
            How Adashe works
          </h2>
          <p className="text-muted text-lg mt-3 max-w-2xl mx-auto text-pretty">
            Rotating savings (also known as tontine, susu, hui, or chama) is a trusted practice 
            in communities worldwide. Adashe brings it onchain.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <ScrollReveal key={step.number} delay={i * 100}>
              <div className="card p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-forest-500 p-2.5 shrink-0">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="font-mono text-terra-300 font-medium text-sm mt-0.5">
                    {step.number}
                  </span>
                </div>
                <h3 className="font-display font-semibold text-forest-500 text-lg mt-5 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed text-pretty">
                  {step.description}
                </p>
              </div>
              </ScrollReveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
