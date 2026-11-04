// IMP-04, IMP-05, IMP-08: the small statistical models that read statements on the
// device. Each is a multinomial logistic regression: a weight per feature and label,
// trained once on synthetic statements (synthetic.ts) and shipped as numbers
// (weights.ts). Reading is a few hundred multiplications per word, the same answer on
// every device, with no network and nothing to download.

export interface Model<Label extends string = string> {
  labels: readonly Label[]
  /** weights[label][feature] */
  weights: readonly (readonly number[])[]
  bias: readonly number[]
}

/** The chance of each label, in the model's order. */
export function scores<Label extends string>(model: Model<Label>, features: readonly number[]) {
  const logits = model.labels.map((_, label) => {
    const row = model.weights[label] ?? []
    let sum = model.bias[label] ?? 0
    for (let index = 0; index < features.length; index += 1)
      sum += (row[index] ?? 0) * (features[index] ?? 0)
    return sum
  })
  const top = Math.max(...logits)
  const exps = logits.map((value) => Math.exp(value - top))
  const total = exps.reduce((sum, value) => sum + value, 0)
  return exps.map((value) => value / total)
}

/** The most likely label and how sure the model is of it. */
export function predict<Label extends string>(
  model: Model<Label>,
  features: readonly number[],
): { label: Label; probability: number } {
  const chances = scores(model, features)
  let best = 0
  for (let index = 1; index < chances.length; index += 1)
    if ((chances[index] ?? 0) > (chances[best] ?? 0)) best = index
  const label = model.labels[best]
  if (label === undefined) throw new Error('A model needs labels')
  return { label, probability: chances[best] ?? 0 }
}

/** A small seeded random number generator (mulberry32), so training repeats exactly. */
export function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Stochastic gradient descent on the cross-entropy, with a little L2 so rare features
 * don't take over. Used by scripts/train-classifier.ts; the app only predicts.
 */
export function train<Label extends string>(
  labels: readonly Label[],
  samples: readonly { features: readonly number[]; label: Label }[],
  options: { epochs?: number; rate?: number; l2?: number; seed?: number } = {},
): Model<Label> {
  const size = samples[0]?.features.length ?? 0
  const weights = labels.map(() => new Array<number>(size).fill(0))
  const bias = labels.map(() => 0)
  const random = seeded(options.seed ?? 1)
  const order = samples.map((_, index) => index)
  const epochs = options.epochs ?? 20
  const l2 = options.l2 ?? 1e-4
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (let index = order.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1))
      ;[order[index], order[other]] = [order[other] ?? 0, order[index] ?? 0]
    }
    const rate = (options.rate ?? 0.1) / (1 + epoch * 0.3)
    for (const position of order) {
      const sample = samples[position]
      if (!sample) continue
      const chances = scores({ labels, weights, bias }, sample.features)
      for (const [label, row] of weights.entries()) {
        const error = (chances[label] ?? 0) - (labels[label] === sample.label ? 1 : 0)
        bias[label] = (bias[label] ?? 0) - rate * error
        for (let feature = 0; feature < size; feature += 1) {
          const value = sample.features[feature] ?? 0
          row[feature] = (row[feature] ?? 0) * (1 - rate * l2) - rate * error * value
        }
      }
    }
  }
  const round = (value: number) => Math.round(value * 1000) / 1000
  return { labels, weights: weights.map((row) => row.map(round)), bias: bias.map(round) }
}
