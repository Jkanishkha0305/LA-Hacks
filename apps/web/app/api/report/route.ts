import { reportRequestSchema } from "@/lib/types/report"
import {
  generateSandboxedHtmlReport,
  getDownloadFilename,
} from "@/lib/report-generation"
import { getGeminiKeyFromRequest } from "@/lib/google-provider"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const geminiApiKey = getGeminiKeyFromRequest(req)

    const body = await req.json()
    const parsed = reportRequestSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid report request",
          issues: parsed.error.issues,
        },
        { status: 400 },
      )
    }

    const { artifact, filename } = parsed.data
    const html = await generateSandboxedHtmlReport(artifact, geminiApiKey)

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${getDownloadFilename(filename)}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report"

    console.error("[report] generation failed", error)

    return Response.json(
      {
        error: message,
      },
      { status: 500 },
    )
  }
}
