'use client'

import { ExternalLink, Users } from 'lucide-react'
import { CircleStatusBadge } from '@/components/ui/StatusBadge'
import { UsdcAmount } from '@/components/ui/UsdcAmount'
import { explorerAddress, Frequency, CONTRACT_ADDRESS, WEEKDAY_LABELS } from '@/lib/contract'

interface CircleHeaderProps {
  cid: bigint
  circleRaw: readonly unknown[]
  isCreator: boolean
}

export function CircleHeader({ cid, circleRaw, isCreator }: CircleHeaderProps) {
  const [circleId, creator, name, contributionAmount, memberCount, frequency, weekday, anchorDay, , status, startTime, currentPeriod] =
    circleRaw as [bigint, string, string, bigint, number, number, number, number, string, number, bigint, number, bigint, bigint]

  const frequencyLabel =
    frequency === Frequency.WEEKLY
      ? `Weekly · ${WEEKDAY_LABELS[weekday] ?? weekday}`
      : `Monthly · day ${anchorDay}`

  return (
    <div className="card-forest px-4 sm:px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <CircleStatusBadge status={status} />
            {isCreator && (
              <span className="text-xs bg-white/15 text-white/90 px-2 py-0.5 rounded-full font-medium">
                Creator
              </span>
            )}
          </div>
          {/* Allow long names to wrap rather than truncate */}
          <h1 className="font-display font-bold text-xl sm:text-2xl text-white tracking-tighter break-words">
            {name}
          </h1>
          <p className="text-white/60 text-xs sm:text-sm mt-1">
            Circle #{cid.toString()} · {frequencyLabel}
          </p>
        </div>
        <a
          href={explorerAddress(CONTRACT_ADDRESS)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="View contract on explorer"
        >
          <ExternalLink className="h-4 w-4 text-white/70" />
        </a>
      </div>

      {/* Stats row: grid-cols-3 on xs+, wraps to 2 on very tiny screens */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-4 pt-4 border-t border-white/10">
        <div className="min-w-0">
          <p className="text-white/50 text-xs">Contribution</p>
          <UsdcAmount amount={contributionAmount} size="sm" className="text-white mt-0.5" />
        </div>
        <div className="min-w-0">
          <p className="text-white/50 text-xs">Members</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Users className="h-4 w-4 text-white/70 shrink-0" />
            <span className="text-white font-medium">{memberCount}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-white/50 text-xs">Period</p>
          <p className="text-white font-medium mt-0.5">
            {Number(currentPeriod) + 1} / {memberCount}
          </p>
        </div>
      </div>
    </div>
  )
}
