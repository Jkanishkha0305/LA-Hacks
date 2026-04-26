"use client"

import { useUser } from "@auth0/nextjs-auth0"
import { Button } from "@workspace/ui/components/button"
import { LogIn, LogOut, Shield } from "lucide-react"

export function AuthButton() {
  const { user, isLoading } = useUser()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="size-6 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (!user) {
    return (
      <a href="/auth/login" className="w-full">
        <Button variant="outline" size="sm" className="w-full gap-2 font-mono text-xs">
          <LogIn className="size-3.5" />
          Sign In
        </Button>
      </a>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {user.picture ? (
          <img
            src={user.picture}
            alt=""
            className="size-6 rounded-full ring-1 ring-border shrink-0"
          />
        ) : (
          <Shield className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="truncate font-mono text-xs text-muted-foreground">
          {user.name || user.email}
        </span>
      </div>
      <a href="/auth/logout">
        <Button variant="ghost" size="icon-xs" title="Sign out">
          <LogOut className="size-3.5" />
        </Button>
      </a>
    </div>
  )
}
