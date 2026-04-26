import type { NextRequest } from "next/server"
import { Auth0Client } from "@auth0/nextjs-auth0/server"

const auth0 = new Auth0Client()

export async function middleware(request: NextRequest) {
  return await auth0.middleware(request)
}

export const config = {
  matcher: [
    // Auth routes handled by Auth0 (login, logout, callback, profile)
    "/auth/:path*",
  ],
}
