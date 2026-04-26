import { Badge } from '@workspace/ui/components/badge'
import type { ParcelData, ConstraintType } from '@/lib/types'

const CONSTRAINT_STYLES: Record<ConstraintType, string> = {
  FIRE: 'bg-red-500/20 text-red-400 border-red-500/30',
  FAULT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  LIQUEFACTION: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  LANDSLIDE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  HISTORIC: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
}

export function ConstraintTag({ type }: { type: ConstraintType }) {
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase px-1.5 py-0 ${CONSTRAINT_STYLES[type]}`}
    >
      {type}
    </Badge>
  )
}

export function getConstraints(data: ParcelData): ConstraintType[] {
  const constraints: ConstraintType[] = []
  if (data.isFireHazard) constraints.push('FIRE')
  if (data.isFaultHazard) constraints.push('FAULT')
  if (data.isLiquefaction) constraints.push('LIQUEFACTION')
  if (data.isLandslide) constraints.push('LANDSLIDE')
  if (data.hpozName) constraints.push('HISTORIC')
  return constraints
}
