import { geocodeAddress, isGeoSearchError } from "@/lib/api/geosearch"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get("address")

  if (!address) {
    return NextResponse.json(
      { error: "Missing 'address' query parameter" },
      { status: 400 },
    )
  }

  const result = await geocodeAddress(address)

  if (isGeoSearchError(result)) {
    return NextResponse.json(result, { status: 404 })
  }

  return NextResponse.json(result)
}
