import { Sandbox, Snapshot } from "@vercel/sandbox"
import { readFile, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  AnalysisArtifact,
  AggregateReportArtifact,
  MediaArtifact,
  ReportArtifact,
} from "@/lib/types/report"

const REPORT_WORKDIR = "/vercel/sandbox/report-job"
const GEMINI_CLI_PACKAGE = "@google/gemini-cli@0.34.0"
const GEMINI_SNAPSHOT_EXPIRATION = 0
const SNAPSHOT_READY_TIMEOUT_MS = 60_000
const SNAPSHOT_READY_POLL_MS = 1_000
const SNAPSHOT_CACHE_PATH = join(tmpdir(), "hh-gemini-cli-snapshot-id")
const REPORT_SANDBOX_TIMEOUT_MS = 420_000
const MAX_PROMPT_STRING_LENGTH = 4_000
const MAX_PROMPT_ARRAY_ITEMS = 12
const MAX_PROMPT_OBJECT_KEYS = 40
const MAX_PROMPT_DEPTH = 6

type ReportPromptMode = "full" | "compact"

let geminiSnapshotIdPromise: Promise<string> | null = null

function stripCodeFence(value: string): string {
  const trimmed = value.trim()

  if (!trimmed.startsWith("```")) {
    return trimmed
  }

  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim()
}

function sanitizeFilename(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")

  const withFallback = normalized || "property-analysis-report.html"
  return withFallback.endsWith(".html") ? withFallback : `${withFallback}.html`
}

function isAggregateReportArtifact(
  artifact: ReportArtifact
): artifact is AggregateReportArtifact {
  return "kind" in artifact && artifact.kind === "aggregate-parcel-report"
}

function truncateText(value: string, max = MAX_PROMPT_STRING_LENGTH): string {
  if (value.length <= max) return value
  const omitted = value.length - max
  return `${value.slice(0, max)}… [truncated ${omitted} chars]`
}

function summarizeDataUri(value: string): string {
  const [prefix = "data:application/octet-stream"] = value.split(",", 1)
  const mimeType = prefix.slice(5).split(";")[0] || "application/octet-stream"
  const approxBytes = Math.floor(Math.max(value.length - prefix.length, 0) * 0.75)
  return `[inline ${mimeType} omitted from prompt, approx ${approxBytes.toLocaleString()} bytes]`
}

function summarizeValueForPrompt(value: unknown, depth = 0): unknown {
  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (typeof value === "string") {
    return value.startsWith("data:")
      ? summarizeDataUri(value)
      : truncateText(value)
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_PROMPT_DEPTH) {
      return `[array omitted at depth ${depth}]`
    }

    const items = value
      .slice(0, MAX_PROMPT_ARRAY_ITEMS)
      .map((item) => summarizeValueForPrompt(item, depth + 1))

    if (value.length > MAX_PROMPT_ARRAY_ITEMS) {
      items.push(`[${value.length - MAX_PROMPT_ARRAY_ITEMS} more items omitted]`)
    }

    return items
  }

  if (typeof value === "object") {
    if (depth >= MAX_PROMPT_DEPTH) {
      return `[object omitted at depth ${depth}]`
    }

    const entries = Object.entries(value)
    const output: Record<string, unknown> = {}

    for (const [key, entryValue] of entries.slice(0, MAX_PROMPT_OBJECT_KEYS)) {
      output[key] = summarizeValueForPrompt(entryValue, depth + 1)
    }

    if (entries.length > MAX_PROMPT_OBJECT_KEYS) {
      output.__omittedKeys = entries.length - MAX_PROMPT_OBJECT_KEYS
    }

    return output
  }

  return String(value)
}

function summarizeMediaArtifactsForPrompt(mediaArtifacts: MediaArtifact[]) {
  return mediaArtifacts.map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    model: artifact.model,
    mimeType: artifact.mimeType,
    hasUrl: Boolean(artifact.url),
    hasInlineData: Boolean(artifact.dataUri),
    inlineDataSummary: artifact.dataUri ? summarizeDataUri(artifact.dataUri) : null,
    createdAt: artifact.createdAt,
  }))
}

function summarizeRecordForPrompt(value: Record<string, unknown>) {
  const summarized = summarizeValueForPrompt(value)
  return typeof summarized === "object" && summarized !== null
    ? (summarized as Record<string, unknown>)
    : {}
}

function buildPromptArtifact(
  artifact: ReportArtifact,
  mode: ReportPromptMode = "full"
): unknown {
  if (isAggregateReportArtifact(artifact)) {
    return {
      kind: artifact.kind,
      generatedAt: artifact.generatedAt,
      title: artifact.title,
      scope: artifact.scope,
      summary: artifact.summary,
      comparativeVision: artifact.comparativeVision
        ? {
            ...summarizeRecordForPrompt({
              rankings: artifact.comparativeVision.rankings,
              comparativeNotes: artifact.comparativeVision.comparativeNotes,
              bestFor: artifact.comparativeVision.bestFor,
              deltas: artifact.comparativeVision.deltas,
            }),
            compositeAerial: artifact.comparativeVision.compositeAerial
              ? summarizeDataUri(
                  `data:image/png;base64,${artifact.comparativeVision.compositeAerial}`
                )
              : null,
          }
        : null,
      parcels: artifact.parcels.map((parcel) => ({
        bbl: parcel.bbl,
        address: parcel.address,
        borough: parcel.borough,
        lat: parcel.lat,
        lng: parcel.lng,
        rawParcelData:
          mode === "compact"
            ? summarizeRecordForPrompt({
                zoningDistrict: (parcel.rawParcelData as Record<string, unknown>)
                  .zoningDistrict,
                lotArea: (parcel.rawParcelData as Record<string, unknown>).lotArea,
                buildingArea: (parcel.rawParcelData as Record<string, unknown>)
                  .buildingArea,
                builtFAR: (parcel.rawParcelData as Record<string, unknown>).builtFAR,
                maxFAR: (parcel.rawParcelData as Record<string, unknown>).maxFAR,
                maxBuildableSF: (parcel.rawParcelData as Record<string, unknown>)
                  .maxBuildableSF,
                score: (parcel.rawParcelData as Record<string, unknown>).score,
                interpretation: (parcel.rawParcelData as Record<string, unknown>)
                  .interpretation,
                incentives: (parcel.rawParcelData as Record<string, unknown>)
                  .incentives,
                envThresholds: (parcel.rawParcelData as Record<string, unknown>)
                  .envThresholds,
                scenarios: (parcel.rawParcelData as Record<string, unknown>)
                  .scenarios,
              })
            : summarizeValueForPrompt(parcel.rawParcelData),
        contextualData:
          mode === "compact"
            ? summarizeRecordForPrompt(parcel.contextualData)
            : summarizeValueForPrompt(parcel.contextualData),
        mediaCatalog:
          mode === "compact"
            ? summarizeMediaArtifactsForPrompt(parcel.mediaArtifacts).map((media) => ({
                id: media.id,
                title: media.title,
                mimeType: media.mimeType,
                hasInlineData: media.hasInlineData,
              }))
            : summarizeMediaArtifactsForPrompt(parcel.mediaArtifacts),
      })),
      promptNotes: [
        "Inline media binaries are omitted from the prompt for token safety.",
        "Use the mediaCatalog metadata to create exhibit placeholders, captions, and visual appendix structure.",
        "Do not invent image contents beyond the artifact metadata and surrounding structured analysis.",
        ...(mode === "compact"
          ? [
              "This artifact was compacted for token safety. Prefer high-signal synthesis over exhaustive evidence rendering.",
            ]
          : []),
      ],
    }
  }

  return {
    userPrompt: truncateText(artifact.userPrompt, mode === "compact" ? 500 : 2_000),
    generatedAt: artifact.generatedAt,
    narrative: truncateText(artifact.narrative, mode === "compact" ? 2_500 : 8_000),
    structuredAnalysis: summarizeValueForPrompt(artifact.structuredAnalysis),
    rawData:
      mode === "compact"
        ? {
            availableSources: Object.keys(artifact.rawData),
          }
        : summarizeValueForPrompt(artifact.rawData),
    mediaCatalog:
      mode === "compact"
        ? summarizeMediaArtifactsForPrompt(artifact.mediaArtifacts).map((media) => ({
            id: media.id,
            title: media.title,
            mimeType: media.mimeType,
            hasInlineData: media.hasInlineData,
          }))
        : summarizeMediaArtifactsForPrompt(artifact.mediaArtifacts),
    promptNotes: [
      "Inline media binaries are omitted from the prompt for token safety.",
      "Use the mediaCatalog metadata to create exhibit placeholders, captions, and visual appendix structure.",
      "Do not invent image contents beyond the artifact metadata and structured analysis.",
      ...(mode === "compact"
        ? [
            "This artifact was compacted for token safety. Prefer high-signal synthesis over exhaustive evidence rendering.",
          ]
        : []),
    ],
  }
}

function buildSharedReportPromptSections(): string[] {
  return [
    "Create a polished single-file HTML report for Los Angeles real estate analysis.",
    "Return one complete HTML document only. No Markdown or code fences.",
    "Use the artifact JSON as the source of truth. Do not invent facts or visuals.",
    "If data is missing, mark it unavailable.",
    "Requirements:",
    "- Self-contained HTML with inline CSS and JS only.",
    "- No external libraries, fonts, images, iframes, or network requests.",
    "- Build an actual report document, not a dashboard.",
    "- Use a formal memo/editorial aesthetic in a restrained light theme.",
    "- CSS must include @page with letter landscape sizing and print-safe margins.",
    "- On desktop, render the report as true page canvases with clear page boundaries and subtle shadows.",
    "- Each major section should be its own page or chapter opener with deliberate page breaks.",
    "- Include page numbers and a consistent page header/footer on interior pages; cover page can be cleaner.",
    "- Include a cover page and a compact table of contents or section index near the front.",
    "- Separate interpretation, metrics, risks, visuals, and evidence clearly.",
    "- Keep raw evidence in appendix-style pages or tightly controlled expandable evidence modules.",
    "- If the prompt includes a mediaCatalog instead of inline image data, create exhibit slots, captions, and appendix placement based on the catalog metadata.",
    "- Use semantic HTML, accessible contrast, and reliable minimal JS for navigation only.",
    "- Desktop should feel like a printable report; mobile can stack pages more fluidly.",
    "- End with a concise recommendation or next-step section.",
    "- Keep copy crisp and specific.",
  ]
}

function buildSinglePropertyReportPrompt(
  artifact: AnalysisArtifact,
  mode: ReportPromptMode = "full"
): string {
  return [
    ...buildSharedReportPromptSections(),
    "Single-property report structure:",
    "- Cover page with report title, property address, BBL, generated date, and one headline takeaway.",
    "- Table of contents / section index.",
    "- Executive summary page.",
    "- Property snapshot page with key metrics foregrounded.",
    "- Development signal / opportunity page.",
    "- Risk and constraints page.",
    "- Market and neighborhood context page.",
    "- Visuals / exhibits page when media exists.",
    "- Recommendation / next steps page.",
    "- Appendix / evidence pages for raw inputs and sources.",
    "Use clear next/previous or TOC navigation, but keep the primary experience page-based.",
    "Use pull quotes, metric blocks, exhibit captions, and chapter openers so it feels like a real report.",
    "If narrative and raw data diverge, trust raw data.",
    ...(mode === "compact"
      ? ["Prompt mode: compact token-safe summary. Keep the report elegant, but prioritize the strongest facts and conclusions."]
      : []),
    "Artifact:",
    JSON.stringify(buildPromptArtifact(artifact, mode)),
  ].join("\n")
}

function buildAggregateReportPrompt(
  artifact: AggregateReportArtifact,
  mode: ReportPromptMode = "full"
): string {
  return [
    ...buildSharedReportPromptSections(),
    "Multi-parcel report structure:",
    "- Cover page with portfolio/comparison framing, parcel count, and headline takeaway.",
    "- Table of contents / section index.",
    "- Executive summary page.",
    "- Comparison scoreboard page near the front.",
    "- Strategy / ranking page summarizing the best opportunities and biggest risks.",
    "- Repeating parcel profile chapters with a consistent page rhythm for each parcel: snapshot, opportunity, risk, visuals/evidence as needed.",
    "- Recommendation / next steps page.",
    "- Appendix / evidence pages for parcel-level raw data and source material.",
    "Compare parcels explicitly and keep each parcel clearly grouped into report chapters.",
    "Use rawParcelData as fact; use contextualData only for framing.",
    "If comparativeVision exists, treat it as named comparative exhibits: rankings, deltas, best-for recommendations, notes, and composite aerial.",
    "Use scoreboard tables, exhibit captions, and chapter divider pages so the document reads like an investment memo, not a product UI.",
    ...(mode === "compact"
      ? ["Prompt mode: compact token-safe summary. Preserve the report structure, but focus on the most decision-relevant parcel differences."]
      : []),
    "Artifact:",
    JSON.stringify(buildPromptArtifact(artifact, mode)),
  ].join("\n")
}

function buildReportPrompt(
  artifact: ReportArtifact,
  mode: ReportPromptMode = "full"
): string {
  return isAggregateReportArtifact(artifact)
    ? buildAggregateReportPrompt(artifact, mode)
    : buildSinglePropertyReportPrompt(artifact, mode)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildMediaAppendixItems(artifact: ReportArtifact): Array<{
  title: string
  subtitle: string | null
  mimeType: string | null
  src: string
}> {
  const items: Array<{
    title: string
    subtitle: string | null
    mimeType: string | null
    src: string
  }> = []

  const pushArtifacts = (
    mediaArtifacts: MediaArtifact[],
    scopeLabel: string | null = null
  ) => {
    for (const media of mediaArtifacts) {
      const src = media.dataUri || media.url
      if (!src) continue

      items.push({
        title: media.title || media.id,
        subtitle: scopeLabel,
        mimeType: media.mimeType,
        src,
      })
    }
  }

  if (isAggregateReportArtifact(artifact)) {
    for (const parcel of artifact.parcels) {
      pushArtifacts(parcel.mediaArtifacts, `${parcel.address} (${parcel.bbl})`)
    }

    if (artifact.comparativeVision?.compositeAerial) {
      items.push({
        title: "Composite Aerial",
        subtitle: artifact.title,
        mimeType: "image/png",
        src: `data:image/png;base64,${artifact.comparativeVision.compositeAerial}`,
      })
    }
  } else {
    pushArtifacts(artifact.mediaArtifacts, artifact.structuredAnalysis.property.address)
  }

  return items
}

function appendMediaAppendix(html: string, artifact: ReportArtifact): string {
  const mediaItems = buildMediaAppendixItems(artifact)
  if (mediaItems.length === 0) return html

  const appendixMarkup = `
<style id="codex-media-appendix-style">
  .codex-media-appendix {
    page-break-before: always;
    break-before: page;
    padding: 32px 24px 56px;
    background: #f4f5f7;
    color: #1d1d1f;
  }
  .codex-media-appendix__header {
    max-width: 1100px;
    margin: 0 auto 24px;
  }
  .codex-media-appendix__eyebrow {
    font: 600 12px/1.2 Arial, sans-serif;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #5f6b76;
    margin-bottom: 8px;
  }
  .codex-media-appendix__title {
    font: 700 32px/1.1 Georgia, serif;
    margin: 0 0 8px;
  }
  .codex-media-appendix__deck {
    font: 400 14px/1.6 Arial, sans-serif;
    color: #49545e;
    margin: 0;
  }
  .codex-media-appendix__grid {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
  }
  .codex-media-appendix__item {
    background: #fff;
    border: 1px solid #d7dce1;
    box-shadow: 0 10px 30px rgba(16, 24, 40, 0.08);
    padding: 14px;
    break-inside: avoid;
  }
  .codex-media-appendix__media {
    width: 100%;
    height: auto;
    display: block;
    border: 1px solid #e5e7eb;
    background: #eef1f4;
    margin-bottom: 12px;
  }
  .codex-media-appendix__item h3 {
    font: 700 18px/1.2 Georgia, serif;
    margin: 0 0 6px;
  }
  .codex-media-appendix__meta {
    font: 400 12px/1.5 Arial, sans-serif;
    color: #5f6b76;
    margin: 0;
  }
  @media print {
    .codex-media-appendix {
      padding: 0.35in 0.35in 0.45in;
      background: #fff;
    }
    .codex-media-appendix__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
<section class="codex-media-appendix" aria-label="Visual appendix">
  <div class="codex-media-appendix__header">
    <div class="codex-media-appendix__eyebrow">Appendix</div>
    <h2 class="codex-media-appendix__title">Visual Appendix</h2>
    <p class="codex-media-appendix__deck">Original report media attached from the artifact payload. These visuals are appended deterministically so large inline binaries do not need to be sent through the model prompt.</p>
  </div>
  <div class="codex-media-appendix__grid">
    ${mediaItems
      .map(
        (item) => `
      <figure class="codex-media-appendix__item">
        <img class="codex-media-appendix__media" src="${escapeHtml(item.src)}" alt="${escapeHtml(item.title)}" />
        <figcaption>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="codex-media-appendix__meta">${escapeHtml(
            [item.subtitle, item.mimeType].filter(Boolean).join(" • ")
          )}</p>
        </figcaption>
      </figure>`
      )
      .join("")}
  </div>
</section>`

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${appendixMarkup}\n</body>`)
  }

  return `${html}\n${appendixMarkup}`
}

function buildSandboxScript(): string {
  return [
    'import { spawn } from "node:child_process";',
    'import { readFile, writeFile } from "node:fs/promises";',
    "",
    "function normalizeHtml(value) {",
    "  const trimmed = value.trim();",
    '  const withoutFence = trimmed.startsWith("\\`\\`\\`")',
    '    ? trimmed.replace(/^\\`\\`\\`[a-zA-Z0-9_-]*\\s*/, "").replace(/\\s*\\`\\`\\`$/, "").trim()',
    "    : trimmed;",
    "",
    "  if (!withoutFence) {",
    '    throw new Error("Gemini CLI returned an empty response");',
    "  }",
    "",
    "  if (!/(<!doctype html>|<html[\\\\s>])/i.test(withoutFence)) {",
    '    throw new Error("Gemini CLI did not return a complete HTML document");',
    "  }",
    "",
    "  return withoutFence;",
    "}",
    "",
    "async function runGemini(prompt) {",
    "  return await new Promise((resolve, reject) => {",
    "    const child = spawn(",
    '      "./node_modules/.bin/gemini",',
    '      ["-p", "", "--output-format", "json"],',
    "      {",
    "        cwd: process.cwd(),",
    '        env: { ...process.env, NO_COLOR: "1" },',
    "        stdio: ['pipe', 'pipe', 'pipe'],",
    "      },",
    "    );",
    "",
    "    const stdoutChunks = [];",
    "    const stderrChunks = [];",
    "",
    "    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));",
    "    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));",
    "    child.on('error', reject);",
    "    child.on('close', (code) => {",
    "      const stdout = Buffer.concat(stdoutChunks).toString('utf8');",
    "      const stderr = Buffer.concat(stderrChunks).toString('utf8');",
    "",
    "      if (code !== 0) {",
    "        reject(new Error(`Gemini CLI exited with code ${code}\\nstdout:\\n${stdout}\\nstderr:\\n${stderr}`));",
    "        return;",
    "      }",
    "",
    "      resolve({ stdout, stderr });",
    "    });",
    "",
    "    child.stdin.end(prompt);",
    "  });",
    "}",
    "",
    'const prompt = await readFile("./prompt.txt", "utf8");',
    "const { stdout, stderr } = await runGemini(prompt);",
    "",
    "if (stderr) {",
    "  process.stderr.write(stderr);",
    "}",
    "",
    "const parsed = JSON.parse(stdout);",
    "if (parsed.error) {",
    '  throw new Error(parsed.error.message || "Gemini CLI failed");',
    "}",
    "",
    'await writeFile("./report.html", normalizeHtml(parsed.response || ""), "utf8");',
  ].join("\n")
}

async function assertSuccess(
  step: Awaited<ReturnType<Sandbox["runCommand"]>>,
  label: string
): Promise<void> {
  if (step.exitCode === 0) return

  const [stdout, stderr] = await Promise.all([step.stdout(), step.stderr()])
  throw new Error(
    `${label} failed with exit code ${step.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`
  )
}

async function writeReportJobFiles(
  sandbox: Sandbox,
  artifact: ReportArtifact,
  mode: ReportPromptMode = "full"
) {
  await sandbox.writeFiles([
    {
      path: `${REPORT_WORKDIR}/package.json`,
      content: Buffer.from(
        JSON.stringify(
          {
            name: "property-report-job",
            private: true,
            type: "module",
          },
          null,
          2
        )
      ),
    },
    {
      path: `${REPORT_WORKDIR}/prompt.txt`,
      content: Buffer.from(buildReportPrompt(artifact, mode)),
    },
    {
      path: `${REPORT_WORKDIR}/generate-report.mjs`,
      content: Buffer.from(buildSandboxScript()),
    },
  ])
}

function shouldRetryWithCompactPrompt(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  return /maximum number of tokens|empty response|invalid_argument/i.test(
    error.message
  )
}

async function waitForSnapshotReady(snapshotId: string): Promise<string> {
  const deadline = Date.now() + SNAPSHOT_READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const snapshot = await Snapshot.get({ snapshotId })

    if (snapshot.status === "created") {
      return snapshot.snapshotId
    }

    if (snapshot.status === "failed" || snapshot.status === "deleted") {
      throw new Error(`Gemini CLI snapshot ${snapshotId} is ${snapshot.status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, SNAPSHOT_READY_POLL_MS))
  }

  throw new Error(`Timed out waiting for Gemini CLI snapshot ${snapshotId}`)
}

async function readCachedSnapshotId(): Promise<string | null> {
  try {
    const snapshotId = (await readFile(SNAPSHOT_CACHE_PATH, "utf8")).trim()
    return snapshotId || null
  } catch {
    return null
  }
}

async function writeCachedSnapshotId(snapshotId: string): Promise<void> {
  await writeFile(SNAPSHOT_CACHE_PATH, `${snapshotId}\n`, "utf8")
}

async function clearCachedSnapshotId(): Promise<void> {
  await unlink(SNAPSHOT_CACHE_PATH).catch(() => undefined)
}

async function createGeminiSnapshot(): Promise<string> {
  const sandbox = await Sandbox.create({
    runtime: "node22",
    timeout: 180_000,
  })

  try {
    await sandbox.mkDir(REPORT_WORKDIR)
    await sandbox.writeFiles([
      {
        path: `${REPORT_WORKDIR}/package.json`,
        content: Buffer.from(
          JSON.stringify(
            {
              name: "property-report-job",
              private: true,
              type: "module",
            },
            null,
            2
          )
        ),
      },
    ])

    const installStep = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", "--silent", GEMINI_CLI_PACKAGE],
      cwd: REPORT_WORKDIR,
    })
    await assertSuccess(installStep, "Gemini CLI install")

    const snapshot = await sandbox.snapshot({
      expiration: GEMINI_SNAPSHOT_EXPIRATION,
    })

    const readySnapshotId = await waitForSnapshotReady(snapshot.snapshotId)
    await writeCachedSnapshotId(readySnapshotId)
    return readySnapshotId
  } catch (error) {
    await sandbox.stop({ blocking: true }).catch(() => undefined)
    throw error
  }
}

async function getGeminiSnapshotId(): Promise<string> {
  const configuredSnapshotId =
    process.env.VERCEL_SANDBOX_GEMINI_SNAPSHOT_ID?.trim() || null

  if (configuredSnapshotId) {
    return configuredSnapshotId
  }

  if (!geminiSnapshotIdPromise) {
    geminiSnapshotIdPromise = (async () => {
      const cachedSnapshotId = await readCachedSnapshotId()

      if (cachedSnapshotId) {
        return cachedSnapshotId
      }

      return createGeminiSnapshot()
    })().catch((error) => {
      geminiSnapshotIdPromise = null
      throw error
    })
  }

  return geminiSnapshotIdPromise
}

async function createReportSandbox(snapshotId: string): Promise<Sandbox> {
  try {
    return await Sandbox.create({
      source: { type: "snapshot", snapshotId },
      timeout: REPORT_SANDBOX_TIMEOUT_MS,
    })
  } catch (error) {
    geminiSnapshotIdPromise = null
    await clearCachedSnapshotId()

    const retrySnapshotId = await getGeminiSnapshotId()
    return Sandbox.create({
      source: { type: "snapshot", snapshotId: retrySnapshotId },
      timeout: REPORT_SANDBOX_TIMEOUT_MS,
    })
  }
}

async function runReportGenerationInSandbox(
  sandbox: Sandbox,
  artifact: ReportArtifact,
  mode: ReportPromptMode,
  geminiApiKey: string,
): Promise<string> {
  await writeReportJobFiles(sandbox, artifact, mode)

  const reportStep = await sandbox.runCommand({
    cmd: "node",
    args: ["generate-report.mjs"],
    cwd: REPORT_WORKDIR,
    env: {
      GEMINI_API_KEY: geminiApiKey,
      HOME: "/tmp/gemini-home",
    },
  })
  await assertSuccess(
    reportStep,
    mode === "compact"
      ? "Report generation (compact retry)"
      : "Report generation"
  )

  const reportBuffer = await sandbox.readFileToBuffer({
    path: "report.html",
    cwd: REPORT_WORKDIR,
  })

  if (!reportBuffer) {
    throw new Error("Report generation completed but report.html was not found")
  }

  return stripCodeFence(reportBuffer.toString("utf8"))
}

export async function generateSandboxedHtmlReport(
  artifact: ReportArtifact,
  geminiApiKey: string,
): Promise<string> {
  const snapshotId = await getGeminiSnapshotId()
  let sandbox = await createReportSandbox(snapshotId)

  try {
    try {
      const html = await runReportGenerationInSandbox(sandbox, artifact, "full", geminiApiKey)
      return appendMediaAppendix(html, artifact)
    } catch (error) {
      if (!shouldRetryWithCompactPrompt(error)) {
        throw error
      }

      await sandbox.stop({ blocking: true }).catch(() => undefined)
      sandbox = await createReportSandbox(snapshotId)

      const html = await runReportGenerationInSandbox(sandbox, artifact, "compact", geminiApiKey)
      return appendMediaAppendix(html, artifact)
    }
  } finally {
    await sandbox.stop({ blocking: true })
  }
}

export function getDownloadFilename(filename: string): string {
  return sanitizeFilename(filename)
}
