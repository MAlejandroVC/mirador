import { randomToken } from './secrets.ts'

export type ChallengeKind = 'registration' | 'sign-in'

export interface Challenge {
  kind: ChallengeKind
  challenge: string
  // Who asked for it, when signed in. A registration always has one.
  userId: string | null
}

// SYS-06: each passkey ceremony signs a fresh random challenge, which the server must
// remember until the browser answers. Kept in memory, like the attempt limits: one
// server process, and a restart only means trying again.
export class Challenges {
  // A Map keeps insertion order, so the first entries are the oldest.
  readonly #pending = new Map<string, Challenge & { expiresAt: number }>()

  constructor(
    private readonly lifetimeMs = 5 * 60 * 1000,
    private readonly now: () => number = Date.now,
    // Bounds memory when someone asks for challenges endlessly; the oldest go first.
    private readonly maxPending = 10_000,
  ) {}

  add(challenge: Challenge) {
    const id = randomToken()
    this.#pending.set(id, { ...challenge, expiresAt: this.now() + this.lifetimeMs })
    for (const oldest of this.#pending.keys()) {
      if (this.#pending.size <= this.maxPending) break
      this.#pending.delete(oldest)
    }
    return id
  }

  // Each challenge works once, whatever the answer: a replayed or second answer to
  // it finds nothing.
  take(id: string, kind: ChallengeKind): Challenge | null {
    const entry = this.#pending.get(id)
    if (!entry) return null
    this.#pending.delete(id)
    if (entry.kind !== kind || entry.expiresAt <= this.now()) return null
    return { kind: entry.kind, challenge: entry.challenge, userId: entry.userId }
  }
}
