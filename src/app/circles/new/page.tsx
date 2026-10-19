'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { WalletGuard } from '@/components/ui/WalletGuard'
import { ChainGuard } from '@/components/ui/ChainGuard'
import { CreateCircleForm } from '@/components/create/CreateCircleForm'

export default function NewCirclePage() {
  return (
    <div className="min-h-dvh bg-ivory-DEFAULT">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
        <WalletGuard message="Connect your wallet to create a circle.">
          <ChainGuard>
            <CreateCircleForm />
          </ChainGuard>
        </WalletGuard>
      </main>
    </div>
  )
}
