import { generateObject, generateImage } from 'ai'
import { GeminiModel } from '@/lib/config/models'
import { getGoogleProvider } from '@/lib/google-provider'
import { z } from 'zod'
import type { ComparativeReport } from '@/lib/types'

export const maxDuration = 60

const parcelInputSchema = z.object({
  bbl: z.string(),
  address: z.string(),
  streetViewImage: z.string(),
  aerialImage: z.string(),
  shadowScore: z.number().nullable(),
  coverageBuiltPct: z.number().nullable(),
  neighborhoodScore: z.number().nullable(),
  envelopeUtilization: z.number().nullable(),
  zoningDistrict: z.string().nullable(),
  lotArea: z.number().nullable(),
  maxFAR: z.number().nullable(),
  farUpside: z.number().nullable(),
  builtFAR: z.number().nullable(),
})

const RequestSchema = z.object({
  parcels: z.array(parcelInputSchema).min(2).max(5),
})

const comparativeReportSchema = z.object({
  rankings: z.array(z.object({
    bbl: z.string(),
    rank: z.number(),
    rationale: z.string(),
  })),
  comparativeNotes: z.string(),
  bestFor: z.object({
    groundUp: z.object({ bbl: z.string(), reason: z.string() }),
    value: z.object({ bbl: z.string(), reason: z.string() }),
    rehab: z.object({ bbl: z.string(), reason: z.string() }),
  }),
  deltas: z.array(z.object({
    metric: z.string(),
    bblA: z.string(),
    valueA: z.string(),
    bblB: z.string(),
    valueB: z.string(),
    insight: z.string(),
  })),
})

export async function POST(req: Request) {
  const google = getGoogleProvider(req)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { parcels } = parsed.data

  // Build context text with all parcel data
  const parcelSummaries = parcels.map((p, i) => {
    const lines = [
      `Parcel ${i + 1}: ${p.address} (BBL: ${p.bbl})`,
      `  Zoning: ${p.zoningDistrict || '?'}, Lot Area: ${p.lotArea?.toLocaleString() || '?'} SF`,
      `  Built FAR: ${p.builtFAR ?? '?'} → Max FAR: ${p.maxFAR ?? '?'} (upside: ${p.farUpside ?? '?'})`,
      `  Shadow Score: ${p.shadowScore ?? '?'}/10, Coverage: ${p.coverageBuiltPct ?? '?'}% built`,
      `  Neighborhood: ${p.neighborhoodScore ?? '?'}/10, Envelope Used: ${p.envelopeUtilization ?? '?'}%`,
    ]
    return lines.join('\n')
  }).join('\n\n')

  // Build image content for the multi-image call
  const imageContent: Array<{ type: 'text'; text: string } | { type: 'file'; data: Buffer; mediaType: 'image/jpeg' }> = []

  imageContent.push({
    type: 'text' as const,
    text: `You are a senior Los Angeles real estate development analyst. Compare these ${parcels.length} development sites and produce a structured comparative analysis.

PARCEL DATA:
${parcelSummaries}

For each parcel, you have a Street View image and an aerial/satellite image below. Use both the images AND the quantitative data to make your assessment.

INSTRUCTIONS:
1. Rank all parcels for ground-up development potential (rank 1 = best)
2. For each ranking, provide a 1-2 sentence rationale referencing both visual evidence and data
3. Identify the most meaningful deltas (differences) between parcels — focus on what makes one clearly better/worse than another
4. Determine which parcel is best for: ground-up development, value investment, and rehab/conversion
5. Provide a brief comparative summary noting what stands out across all sites

Use the BBL values exactly as provided in rankings, bestFor, and deltas.`,
  })

  for (let i = 0; i < parcels.length; i++) {
    const p = parcels[i]!
    imageContent.push({ type: 'text' as const, text: `\n--- Parcel ${i + 1}: ${p.address} (${p.bbl}) ---\nStreet View:` })
    imageContent.push({ type: 'file' as const, data: Buffer.from(p.streetViewImage, 'base64'), mediaType: 'image/jpeg' as const })
    imageContent.push({ type: 'text' as const, text: 'Aerial/Satellite:' })
    imageContent.push({ type: 'file' as const, data: Buffer.from(p.aerialImage, 'base64'), mediaType: 'image/jpeg' as const })
  }

  // Call 1: Cross-parcel comparative analysis
  let report: Omit<ComparativeReport, 'compositeAerial'> | null = null
  try {
    const { object } = await generateObject({
      model: google(GeminiModel.FLASH_IMAGE),
      schema: comparativeReportSchema,
      messages: [{ role: 'user', content: imageContent }],
    })
    report = object
  } catch (err) {
    console.error('Comparative analysis failed:', err)
    return Response.json({ error: 'Comparative analysis failed' }, { status: 500 })
  }

  // Call 2: Composite annotated aerial
  let compositeAerial: string | null = null
  try {
    const aerialBuffers = parcels.map(p => Buffer.from(p.aerialImage, 'base64'))
    const labels = report.rankings
      .map(r => {
        const p = parcels.find(pp => pp.bbl === r.bbl)
        return `#${r.rank}: ${p?.address || r.bbl}`
      })
      .join(', ')

    const { image } = await generateImage({
      model: google.image(GeminiModel.FLASH_IMAGE),
      prompt: {
        images: aerialBuffers,
        text: `Create an annotated composite comparison of these ${parcels.length} Los Angeles development sites. Rankings: ${labels}. For each aerial image: draw the lot boundary in yellow, label with rank number and address, add a brief development verdict (e.g., "BEST FOR GROUND-UP", "HIGH SHADOW RISK"). Style: professional comparative site analysis.`,
      },
    })
    compositeAerial = image.base64
  } catch (err) {
    console.error('Composite aerial generation failed:', err)
  }

  const result: ComparativeReport = {
    ...report,
    compositeAerial,
  }

  return Response.json(result)
}
