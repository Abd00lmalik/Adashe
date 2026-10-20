'use client'

import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { USDC_ADDRESS, ERC20_ABI, USDC_DECIMALS } from '@/lib/usdc'
import { CONTRACT_ADDRESS } from '@/lib/contract'
import { TxButton, type TxState } from './TxButton'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { CheckCircle2 } from 'lucide-react'
import { formatUnits } from 'viem'

interface UsdcApproveAndActionProps {
  /** Amount in raw 6-decimal USDC units */
  amount: bigint
  actionLabel: string
  onAction: () => void
  actionTxState: TxState
  disabled?: boolean
}

export function UsdcApproveAndAction({
  amount,
  actionLabel,
  onAction,
  actionTxState,
  disabled,
}: UsdcApproveAndActionProps) {
  const { address } = useAccount()
  const [approveTxState, setApproveTxState] = useState<TxState>({ status: 'idle' })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESS] : undefined,
    query: { enabled: !!address },
  })

  const { writeContractAsync } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: approveTxState.status === 'confirming' ? approveTxState.hash as `0x${string}` : undefined,
  })

  const hasEnoughAllowance = allowance !== undefined && allowance >= amount

  const handleApprove = async () => {
    if (!address) return
    setApproveTxState({ status: 'signing' })
    try {
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, amount],
      })
      setApproveTxState({ status: 'confirming', hash })
      // Wait for the receipt via polling (simplified — refetch allowance when confirming clears)
      const poll = setInterval(async () => {
        const updated = await refetchAllowance()
        if (updated.data !== undefined && updated.data >= amount) {
          clearInterval(poll)
          setApproveTxState({ status: 'success', hash })
        }
      }, 2000)
      setTimeout(() => clearInterval(poll), 60_000) // safety timeout
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed'
      setApproveTxState({
        status: 'error',
        message: msg.includes('User rejected') ? 'You rejected the approval.' : msg.slice(0, 80),
      })
    }
  }

  if (hasEnoughAllowance) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          USDC approved ({formatUnits(allowance, USDC_DECIMALS)} available)
        </div>
        <TxButton
          txState={actionTxState}
          onAction={onAction}
          idleLabel={actionLabel}
          disabled={disabled}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Step 1 of 2: Approve <UsdcAmount amount={amount} size="sm" /> for the contract to collect.
      </p>
      <TxButton
        txState={approveTxState}
        onAction={handleApprove}
        idleLabel={`Approve ${formatUnits(amount, USDC_DECIMALS)} USDC`}
        signingLabel="Approving…"
        successLabel="Approved: ready for step 2"
        disabled={isConfirming}
      />
      {(approveTxState.status === 'success') && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted">Step 2 of 2: {actionLabel}</p>
          <TxButton
            txState={actionTxState}
            onAction={onAction}
            idleLabel={actionLabel}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}
