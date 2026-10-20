'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ConnectKitButton } from 'connectkit'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useAccount } from 'wagmi'

export function Hero() {
  const { isConnected } = useAccount()

  return (
    <section className="relative overflow-hidden min-h-[80vh] sm:min-h-[85vh] flex items-center">
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=80&auto=format&fit=crop"
          alt="Hands exchanging cash and making a payment, representing trusted financial transactions"
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
        />
        {/* Stronger gradient on mobile so text is always readable */}
        <div className="absolute inset-0 bg-gradient-to-b from-forest-600/75 via-forest-600/70 to-forest-600/60 sm:bg-gradient-to-r sm:from-forest-600/80 sm:via-forest-500/60 sm:to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24 lg:py-28">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white/90 mb-5 backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-terra-300 shrink-0" />
            Smart contract enforced savings on Arc Testnet
          </span>

          <h1 className="font-display font-bold text-white text-3xl sm:text-5xl lg:text-6xl leading-tight tracking-tighter text-balance mb-5">
            Save together.
            <br />
            <span className="text-terra-300">Trust the contract.</span>
          </h1>

          <p className="text-white/80 text-base sm:text-xl text-pretty mb-7 max-w-lg">
            Adashe brings the rotating savings tradition onchain. Your group commits, contributes, 
            and each member receives their turn, governed by smart contract, not promises.
          </p>

          {/* CTA buttons — full-width on mobile, auto on sm+ */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
            {isConnected ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 bg-terra-400 hover:bg-terra-500 text-white px-6 py-3.5 sm:py-3 rounded-xl font-medium transition-all active:scale-[0.98] min-h-[48px]"
              >
                Go to my circles <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            ) : (
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <button
                    onClick={show}
                    className="inline-flex items-center justify-center gap-2 bg-terra-400 hover:bg-terra-500 text-white px-6 py-3.5 sm:py-3 rounded-xl font-medium transition-all active:scale-[0.98] min-h-[48px]"
                  >
                    Connect wallet to start <ArrowRight className="h-4 w-4 shrink-0" />
                  </button>
                )}
              </ConnectKitButton.Custom>
            )}
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 text-white px-6 py-3.5 sm:py-3 rounded-xl font-medium transition-all backdrop-blur-sm min-h-[48px]"
            >
              How it works
            </a>
          </div>

          <p className="text-xs text-white/50 mt-5">
            Testnet only. No real funds involved. Transactions are visible on the Arc Testnet explorer.
          </p>
        </div>
      </div>
    </section>
  )
}
