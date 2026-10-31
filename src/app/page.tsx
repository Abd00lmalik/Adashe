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
import { FAQ } from '@/components/landing/FAQ'
import { ScrollReveal } from '@/components/ui/ScrollReveal'

const benefits = [
  {
    icon: Lock,
    title: 'Private by design',
    body: 'No public directory. Circles are invitation-only; joining requires a private link, a PIN, and your wallet address must be pre-registered.',
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
            <ScrollReveal>
              <div className="text-center mb-14">
                <h2 className="font-display font-bold text-3xl sm:text-4xl text-forest-500 tracking-tighter text-balance">
                  Savings with shared visibility
                </h2>
                <p className="text-muted text-lg mt-3 max-w-xl mx-auto text-pretty">
                  Adashe does not promise guaranteed returns. It enforces the rules everyone agreed to,
                  transparently and without a trusted third party.
                </p>
              </div>
            </ScrollReveal>

            <div className="grid sm:grid-cols-2 gap-5">
              {benefits.map((b, i) => {
                const Icon = b.icon
                return (
                  <ScrollReveal key={b.title} delay={i * 80}>
                    <div className="card p-6 flex gap-4 h-full">
                      <div className="rounded-xl bg-terra-50 p-2.5 h-fit shrink-0">
                        <Icon className="h-5 w-5 text-terra-400" />
                      </div>
                      <div>
                        <h3 className="font-display font-semibold text-forest-500 mb-1">{b.title}</h3>
                        <p className="text-sm text-muted leading-relaxed text-pretty">{b.body}</p>
                      </div>
                    </div>
                  </ScrollReveal>
                )
              })}
            </div>
          </div>
        </section>

        {/* Community imagery focused on finance and payments */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 overflow-hidden">
          <div className="mx-auto max-w-5xl">
            <ScrollReveal>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 rounded-2xl sm:rounded-3xl overflow-hidden">
                {/* Mobile payment / money exchange */}
                <div className="relative aspect-[16/7] sm:aspect-auto sm:row-span-2">
                  <Image
                    src="https://images.unsplash.com/photo-1617791160505-6f00504e3519?w=800&q=75&auto=format&fit=crop"
                    alt="Person sending a mobile payment, representing digital money transfer"
                    fill
                    className="object-cover object-center"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                </div>
                {/* People discussing finances together */}
                <div className="relative aspect-[4/3] sm:aspect-video">
                  <Image
                    src="https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&q=75&auto=format&fit=crop"
                    alt="Two people reviewing finances and planning savings together"
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                </div>
                {/* Cash and coins — savings imagery */}
                <div className="relative aspect-[4/3] sm:aspect-video">
                  <Image
                    src="https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=600&q=75&auto=format&fit=crop"
                    alt="Stacked coins and savings jar representing community savings goals"
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        <FAQ />

        {/* Closing CTA */}
        <section className="py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-xl text-center">
            <ScrollReveal>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-forest-500 tracking-tighter text-balance mb-4">
                Ready to start a circle?
              </h2>
              <p className="text-muted text-lg mb-8 text-pretty">
                Connect your wallet, create a circle, and invite your group.
                The first contribution is due immediately when the creator starts the circle.
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
            </ScrollReveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-ivory-300 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Adashe logo" width={24} height={24} className="rounded" />
            <span className="font-medium text-forest-500">Adashe</span>
            <span>rotating savings on Arc</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://explorer.arc.io/address/0xbb1f1e47900a966a12250c1dc0c9fe325f1caebf"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-terra-400 transition-colors"
            >
              Contract
            </a>
            <span>v13</span>
          </div>
        </div>
        <div className="mx-auto max-w-5xl mt-4 text-xs text-muted/70">
          Adashe is a savings tool, not a financial product, investment vehicle, or bank.
          Transactions use real USDC on Arc and are irreversible.
          On-chain activity is publicly visible. Wallet addresses and transaction data are not private.
        </div>
      </footer>
    </div>
  )
}
