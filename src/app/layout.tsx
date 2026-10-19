import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { Web3Provider } from '@/providers/Web3Provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Adashe — Rotating Savings on Arc',
  description:
    'Private, invitation-based rotating savings circles. Contribute together, receive your turn — enforced by smart contract on Arc.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000'),
  openGraph: {
    title: 'Adashe — Rotating Savings on Arc',
    description:
      'Private, invitation-based rotating savings circles — powered by USDC on Arc.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: '#F5F0E6',
                color: '#244B3C',
                border: '1px solid #EDE4D0',
                borderRadius: '12px',
                maxWidth: 'calc(100vw - 32px)',
              },
            }}
          />
        </Web3Provider>
      </body>
    </html>
  )
}
