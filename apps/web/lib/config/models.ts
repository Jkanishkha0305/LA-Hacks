export const GeminiModel = {
  PRO: "gemini-3.1-pro-preview",
  FLASH_LITE: "gemini-3.1-flash-lite-preview",
  FLASH_IMAGE: "gemini-3.1-flash-image-preview",
} as const

export type GeminiModelId = (typeof GeminiModel)[keyof typeof GeminiModel]
