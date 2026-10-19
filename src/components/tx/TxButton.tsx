'use client'

import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { explorerTx } from '@/lib/contract'
import { cn } from '@/lib/utils'

export type TxState =
  | { status: 'idle' }
  | { status: 'signing' }
  | { status: 'confirming'; hash: string }
  | { status: 'success'; hash: string }
  | { status: 'error'; message: string }

interface TxButtonProps {
  txState: TxState
  onAction: () => void
  idleLabel: string
  signingLabel?: string
  confirmingLabel?: string
  successLabel?: string
  disabled?: boolean
  className?: string
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'lg'
}

export function TxButton({
  txState,
  onAction,
  idleLabel,
  signingLabel = 'Awaiting signature…',
  confirmingLabel = 'Confirming…',
  successLabel = 'Success',
  disabled,
  className,
  variant = 'default',
  size = 'default',
}: TxButtonProps) {
  const isLoading = txState.status === 'signing' || txState.status === 'confirming'
  const isSuccess = txState.status === 'success'
  const isError = txState.status === 'error'

  if (isSuccess) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2 text-success text-sm font-medium">
          <CheckCircle2 className="h-4 w-4" />
          {successLabel}
        </div>
        {txState.status === 'success' && txState.hash && (
          <a
            href={explorerTx(txState.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted hover:text-terra-400 transition-colors"
          >
            View on explorer <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-danger text-sm">
          <XCircle className="h-4 w-4" />
          <span className="text-xs">{txState.message}</span>
        </div>
        <Button
          variant={variant}
          size={size}
          onClick={onAction}
          disabled={disabled}
          className={className}
        >
          Try again
        </Button>
      </div>
    )
  }

  const label = isLoading
    ? txState.status === 'signing'
      ? signingLabel
      : confirmingLabel
    : idleLabel

  return (
    <Button
      variant={variant}
      size={size}
      onClick={!isLoading ? onAction : undefined}
      disabled={disabled || isLoading}
      className={cn(className)}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </Button>
  )
}
