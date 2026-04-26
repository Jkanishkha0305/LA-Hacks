import { z } from "zod"

const envSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional().default(""),
  GOOGLE_MAPS_API_KEY: z.string().optional().default(""),
  SOCRATA_APP_TOKEN: z.string().optional().default(""),
  CENSUS_API_KEY: z.string().optional().default(""),
  HUD_API_TOKEN: z.string().optional().default(""),
})

function validateEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    throw new Error(`Missing required environment variables:\n${missing}`)
  }
  return result.data
}

export const env = validateEnv()
