import type { ReportArtifact } from "@/lib/types/report"
import { geminiHeaders } from "./headers"

export async function downloadGeneratedReport({
  artifact,
  filename,
}: {
  artifact: ReportArtifact
  filename: string
}): Promise<void> {
  const response = await fetch("/api/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...geminiHeaders(),
    },
    body: JSON.stringify({
      artifact,
      filename,
    }),
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string
    } | null

    throw new Error(data?.error || "Failed to generate report")
  }

  const blob = await response.blob()
  const disposition = response.headers.get("Content-Disposition")
  const matchedName = disposition?.match(/filename="([^"]+)"/)
  const resolvedFilename = matchedName?.[1] || filename
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = resolvedFilename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}
