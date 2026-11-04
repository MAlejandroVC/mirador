import { env } from 'onnxruntime-web'
import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

// IMP-11, NFR-01: ONNX Runtime loads its WebAssembly from the app itself, never from a
// CDN. This module runs before the OCR library is imported, which would otherwise
// point it at one. One thread: more need cross-origin isolation, which the app doesn't
// turn on, and one picture at a time is quick enough.
env.wasm.wasmPaths = { wasm }
env.wasm.numThreads = 1

/** The largest heap granted, in 64 KiB pages, when the browser refused the 4 GiB ask. */
export let heapLimit: number | null = null

// IMP-05, IMP-07: ONNX Runtime asks for a shared memory of up to 4 GiB. Safari on an
// iPhone reserves the whole maximum up front and refuses it ("Out of memory"), so the
// text reader never loaded there. A refused ask is retried with half the maximum, down
// to 256 MiB; any ask the browser grants is left as it is.
const Native = WebAssembly.Memory
const floor = 4096
function Capped(descriptor: WebAssembly.MemoryDescriptor): WebAssembly.Memory {
  try {
    return new Native(descriptor)
  } catch (error) {
    let maximum = descriptor.maximum ?? 0
    if (!(error instanceof RangeError) || maximum <= floor) throw error
    for (;;) {
      maximum = Math.max(floor, Math.floor(maximum / 2), descriptor.initial)
      try {
        const memory = new Native({ ...descriptor, maximum })
        heapLimit = maximum
        return memory
      } catch (again) {
        if (!(again instanceof RangeError) || maximum <= floor) throw again
      }
    }
  }
}
Capped.prototype = Native.prototype
WebAssembly.Memory = Capped as unknown as typeof WebAssembly.Memory
