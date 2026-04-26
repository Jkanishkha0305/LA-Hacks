/**
 * Token bucket rate limiter for Socrata API (900 req/hr).
 * Waits when bucket is empty rather than failing.
 */
export class TokenBucketLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per ms

  constructor(maxPerHour: number) {
    this.maxTokens = maxPerHour
    this.tokens = maxPerHour
    this.lastRefill = Date.now()
    this.refillRate = maxPerHour / (60 * 60 * 1000)
  }

  private refill() {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }

  async acquire(): Promise<void> {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    this.refill()
    this.tokens -= 1
  }
}

export const socrataLimiter = new TokenBucketLimiter(900)
