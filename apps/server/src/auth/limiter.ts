// Counts attempts per key (an address or a username) in a fixed window, in memory:
// one server process, and a restart forgetting the counts is fine.
export class Limiter {
  // A Map keeps insertion order, so the first entries are the oldest windows.
  readonly #hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    // Bounds memory when someone sends from endless addresses. Dropping the oldest
    // window only forgets old counts early.
    private readonly maxKeys = 50_000,
  ) {}

  blocked(key: string) {
    const entry = this.#hits.get(key)
    return entry !== undefined && entry.resetAt > this.now() && entry.count >= this.max
  }

  hit(key: string) {
    const now = this.now()
    const entry = this.#hits.get(key)
    if (entry && entry.resetAt > now) {
      entry.count += 1
      return
    }
    this.#hits.delete(key)
    this.#hits.set(key, { count: 1, resetAt: now + this.windowMs })
    if (this.#hits.size > this.maxKeys) {
      // A tenth at a time, in one pass, so a flood of new keys costs little each.
      let excess = this.#hits.size - Math.floor(this.maxKeys * 0.9)
      for (const oldest of this.#hits.keys()) {
        if (excess-- <= 0) break
        this.#hits.delete(oldest)
      }
    }
  }

  clear(key: string) {
    this.#hits.delete(key)
  }
}
