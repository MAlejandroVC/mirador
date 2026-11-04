import { afterEach, describe, expect, it, vi } from 'vitest'

// Safari on an iPhone refuses a shared memory whose maximum it can't reserve. This
// stands in for it: anything over 1 GiB (16384 pages of 64 KiB) is refused.
const Real = WebAssembly.Memory
afterEach(() => {
  WebAssembly.Memory = Real
  vi.resetModules()
})

describe('text reader memory', () => {
  it('IMP-05: asks again for a smaller heap when the browser refuses 4 GiB', async () => {
    const asked: number[] = []
    WebAssembly.Memory = function (descriptor: WebAssembly.MemoryDescriptor) {
      asked.push(descriptor.maximum ?? 0)
      if ((descriptor.maximum ?? 0) > 16384) throw new RangeError('Out of memory')
      return new Real(descriptor)
    } as unknown as typeof WebAssembly.Memory
    const setup = await import('./ort-setup')
    const memory = new WebAssembly.Memory({ initial: 256, maximum: 65536, shared: true })
    expect(memory.buffer.byteLength).toBe(256 * 65536)
    expect(asked).toEqual([65536, 32768, 16384])
    expect(setup.heapLimit).toBe(16384)
  })

  it('IMP-05: leaves a heap the browser grants as it is', async () => {
    const setup = await import('./ort-setup')
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true })
    expect(memory).toBeInstanceOf(Real)
    expect(setup.heapLimit).toBeNull()
  })
})
