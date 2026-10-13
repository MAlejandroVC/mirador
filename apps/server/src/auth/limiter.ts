// Counts attempts per key (an address or a username) in a fixed window, in memory:
// one server process, and a restart forgetting the counts is fine.
export class Limiter {
  readonly #hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  blocked(key: string) {
    const entry = this.#hits.get(key)
    return entry !== undefined && entry.resetAt > this.now() && entry.count >= this.max
  }

  hit(key: string) {
    const now = this.now()
    if (this.#hits.size > 10_000) this.#sweep(now)
    const entry = this.#hits.get(key)
    if (entry && entry.resetAt > now) entry.count += 1
    else this.#hits.set(key, { count: 1, resetAt: now + this.windowMs })
  }

  clear(key: string) {
    this.#hits.delete(key)
  }

  #sweep(now: number) {
    for (const [key, entry] of this.#hits) if (entry.resetAt <= now) this.#hits.delete(key)
  }
}
