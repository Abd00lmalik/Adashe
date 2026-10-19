'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ConnectKitButton } from 'connectkit'
import { ArrowRight, Lock, Eye, FileCheck, Zap } from 'lucide-react'
import { useAccount } from 'wagmi'
import { Navbar } from '@/components/layout/Navbar'
import { Hero } from '@/components/landing/Hero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { SampleCircle } from '@/components/landing/SampleCircle'

const benefits = [
  {
    icon: Lock,
    title: 'Private by design',
    body: 'No public directory. Circles are invitation-only; joining requires a private link, a PIN, and creator approval.',
  },
  {
    icon: FileCheck,
    title: 'Rules you can read',
    body: 'Contribution amounts, deadlines, payout order, and grace periods are set at creation and enforced by open-source smart contract code.',
  },
  {
    icon: Eye,
    title: 'Transparent accounting',
    body: 'Every contribution, default, reserve use, and payout is recorded onchain. No hidden deductions, no manual overrides.',
  },
  {
    icon: Zap,
    title: 'No middleman holds funds',
    body: 'The contract holds USDC in escrow. The creator coordinates but cannot redirect funds, erase debt, or cancel an active circle.',
  },
]

export default function LandingPage() {
  const { isConnected } = useAccount()

  return (
    <div className="min-h-dvh bg-ivory-DEFAULT">
      <Navbar />

      <main>
        <Hero />
        <HowItWorks />
        <SampleCircle />

        {/* Benefits */}
        <section className="py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-14">
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-forest-500 tracking-tighter text-balance">
                Savings with shared visibility
              </h2>
              <p className="text-muted text-lg mt-3 max-w-xl mx-auto text-pretty">
                Adashe does not promise guaranteed returns. It enforces the rules everyone agreed to 
                — transparently, and without a trusted third party.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              {benefits.map((b) => {
                const Icon = b.icon
                return (
                  <div key={b.title} className="card p-6 flex gap-4">
                    <div className="rounded-xl bg-terra-50 p-2.5 h-fit shrink-0">
                      <Icon className="h-5 w-5 text-terra-400" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-forest-500 mb-1">{b.title}</h3>
                      <p className="text-sm text-muted leading-relaxed text-pretty">{b.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Community imagery — stacks to 1 col on mobile, 3 col on sm+ */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 overflow-hidden">
          <div className="mx-auto max-w-5xl">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 rounded-2xl sm:rounded-3xl overflow-hidden">
              {/* On mobile: single landscape banner instead of tall square */}
              <div className="relative aspect-[16/7] sm:aspect-auto sm:row-span-2">
                <Image
                  src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=75&auto=format&fit=crop"
                  alt="Group of people gathered together in community"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
              </div>
              <div className="relative aspect-[4/3] sm:aspect-video">
                <Image
                  src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=600&q=75&auto=format&fit=crop"
                  alt="People working together on shared goals"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
              </div>
              <div className="relative aspect-[4/3] sm:aspect-video">
                <Image
                  src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=600&q=75&auto=format&fit=crop"
                  alt="Notebook and planning materials on a wooden surface"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-forest-500 tracking-tighter text-balance mb-4">
              Ready to start a circle?
            </h2>
            <p className="text-muted text-lg mb-8 text-pretty">
              Connect your wallet, create a circle, and invite your group. 
              First contribution is due immediately when everyone joins.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-3">
              {isConnected ? (
                <Link
                  href="/circles/new"
                  className="inline-flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 text-white px-7 py-3.5 rounded-xl font-medium transition-all active:scale-[0.98] min-h-[48px]"
                >
                  Create a circle <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              ) : (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button
                      onClick={show}
                      className="inline-flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 text-white px-7 py-3.5 rounded-xl font-medium transition-all active:scale-[0.98] min-h-[48px]"
                    >
                      Connect wallet <ArrowRight className="h-4 w-4 shrink-0" />
                    </button>
                  )}
                </ConnectKitButton.Custom>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-ivory-300 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-forest-500 flex items-center justify-center text-white font-display font-bold text-xs">A</span>
            <span className="font-medium text-forest-500">Adashe</span>
            <span>— rotating savings on Arc Testnet</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://explorer.testnet.arc.io/address/0xcd7c871f4d0ce61ef2c90f12d2b0384299134784"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-terra-400 transition-colors"
            >
              Contract
            </a>
            <span>v4 testnet</span>
          </div>
        </div>
        <div className="mx-auto max-w-5xl mt-4 text-xs text-muted/70">
          Adashe is a testnet demonstration. It is not a financial product, investment vehicle, or bank. 
          All transactions are on Arc Testnet and involve no real funds. 
          On-chain activity is publicly visible — wallet addresses and transaction data are not private.
        </div>
      </footer>
    </div>
  )
}
