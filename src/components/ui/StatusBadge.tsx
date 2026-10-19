import { Badge } from './badge'
import { CircleStatus, ContributionStatus, CIRCLE_STATUS_LABELS, CONTRIBUTION_STATUS_LABELS } from '@/lib/contract'

export function CircleStatusBadge({ status }: { status: number }) {
  const s = status as CircleStatus
  const variantMap: Record<CircleStatus, 'pending' | 'active' | 'completed'> = {
    [CircleStatus.PENDING]: 'pending',
    [CircleStatus.ACTIVE]: 'active',
    [CircleStatus.COMPLETED]: 'completed',
  }
  return <Badge variant={variantMap[s]}>{CIRCLE_STATUS_LABELS[s] ?? 'Unknown'}</Badge>
}

export function ContributionStatusBadge({ status }: { status: number }) {
  const s = status as ContributionStatus
  const variantMap: Record<ContributionStatus, 'default' | 'active' | 'danger' | 'warning' | 'terra'> = {
    [ContributionStatus.PENDING]: 'warning',
    [ContributionStatus.PAID]: 'active',
    [ContributionStatus.LATE_PAID]: 'terra',
    [ContributionStatus.DEFAULTED]: 'danger',
    [ContributionStatus.COVERED_BY_RESERVE]: 'info' as 'terra',
  }
  return <Badge variant={variantMap[s]}>{CONTRIBUTION_STATUS_LABELS[s] ?? 'Unknown'}</Badge>
}
