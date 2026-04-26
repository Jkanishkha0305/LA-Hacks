import { Button } from '@workspace/ui/components/button'
import type { ParcelStatus } from '@/lib/types'

interface AgentStatusProps {
  progress?: string
  status: ParcelStatus
  error?: string
  onRetry?: () => void
}

export function AgentStatus({ progress, status, error, onRetry }: AgentStatusProps) {
  if (status === 'ready') return null

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-destructive">{error || 'Analysis failed'}</span>
        {onRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry} className="h-6 px-2 text-xs">
            Retry
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
      <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
      <span>{progress || 'Analyzing...'}</span>
    </div>
  )
}
