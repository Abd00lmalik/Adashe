import { UsdcAmount } from '@/components/ui/UsdcAmount'

// Illustrative example only — not real data
const MEMBERS = ['Alice', 'Ben', 'Chioma', 'David', 'Emeka']
const CONTRIBUTION = BigInt(250_000_000) // 250 USDC (6 decimals)
const GROSS_PAYOUT = BigInt(1_000_000_000) // 1000 USDC

export function SampleCircle() {
  return (
    <section className="py-20 px-4 sm:px-6 bg-forest-500">
      <div className="mx-auto max-w-5xl">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Explanation */}
          <div>
            <p className="text-terra-300 text-sm font-medium tracking-wider uppercase mb-3">
              Illustrative example
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tighter text-balance mb-5">
              Five members, 250 USDC each, five turns
            </h2>
            <p className="text-white/70 text-pretty leading-relaxed mb-6">
              Each member contributes 250 USDC per period. The scheduled recipient collects the 
              other four contributions — 1,000 USDC gross. One contribution amount is withheld as 
              their reserve for future obligations. The circle rotates until everyone has received.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-white/80">
                <span>Members</span>
                <span className="font-medium">5</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Contribution per period</span>
                <span className="font-medium font-mono">250 USDC</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Gross payout per turn</span>
                <span className="font-medium font-mono">1,000 USDC</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Reserve withheld</span>
                <span className="font-medium font-mono">250 USDC</span>
              </div>
              <div className="flex justify-between text-white border-t border-white/20 pt-2 mt-2">
                <span className="font-medium">Net payout (if no debt)</span>
                <span className="font-semibold font-mono">750 USDC</span>
              </div>
            </div>
            <p className="text-white/40 text-xs mt-6">
              Figures are illustrative. Actual payouts depend on all members contributing on time 
              and the recipient having no outstanding debt. Smart contract terms govern all outcomes.
            </p>
          </div>

          {/* Payout table */}
          <div className="card p-0 overflow-hidden">
            <div className="bg-forest-400 px-5 py-3">
              <p className="text-white/80 text-xs font-medium tracking-wider uppercase">
                Payout rotation — illustrative
              </p>
            </div>
            {/* Horizontal scroll on narrow screens */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[280px]">
                <thead>
                  <tr className="border-b border-ivory-300">
                    <th className="text-left px-4 py-2.5 text-muted font-medium text-xs whitespace-nowrap">Period</th>
                    <th className="text-left px-4 py-2.5 text-muted font-medium text-xs whitespace-nowrap">Recipient</th>
                    <th className="text-right px-4 py-2.5 text-muted font-medium text-xs whitespace-nowrap">Gross payout</th>
                  </tr>
                </thead>
                <tbody>
                  {MEMBERS.map((name, i) => (
                    <tr key={name} className="border-b border-ivory-200 last:border-0">
                      <td className="px-4 py-3 font-mono text-muted text-xs">{i + 1}</td>
                      <td className="px-4 py-3 text-forest-500 font-medium">{name}</td>
                      <td className="px-4 py-3 text-right">
                        <UsdcAmount
                          amount={GROSS_PAYOUT}
                          size="sm"
                          className="text-forest-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
