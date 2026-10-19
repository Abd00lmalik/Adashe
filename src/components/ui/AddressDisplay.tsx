'use client'

import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { cn, truncateAddress } from '@/lib/utils'
import { explorerAddress } from '@/lib/contract'

interface AddressDisplayProps {
  address: string
  chars?: number
  showExplorer?: boolean
  className?: string
}

export function AddressDisplay({
  address,
  chars = 4,
  showExplorer = true,
  className,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <span className={cn('inline-flex items-center gap-0.5 min-w-0', className)}>
      <span className="font-mono text-sm tabular-nums truncate">{truncateAddress(address, chars)}</span>
      {/* Touch target: min 44×44px achieved via negative margin + padding trick */}
      <button
        onClick={handleCopy}
        className="inline-flex items-center justify-center -m-1 p-1.5 rounded text-muted hover:text-forest-500 transition-colors touch-manipulation"
        aria-label="Copy address"
        style={{ minWidth: '32px', minHeight: '32px' }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      {showExplorer && (
        <a
          href={explorerAddress(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center -m-1 p-1.5 rounded text-muted hover:text-terra-400 transition-colors touch-manipulation"
          aria-label="View on explorer"
          style={{ minWidth: '32px', minHeight: '32px' }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  )
}
