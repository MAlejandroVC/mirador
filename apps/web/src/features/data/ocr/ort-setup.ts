import { env } from 'onnxruntime-web'
import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

// IMP-11, NFR-01: ONNX Runtime loads its WebAssembly from the app itself, never from a
// CDN. This module runs before the OCR library is imported, which would otherwise
// point it at one. One thread: more need cross-origin isolation, which the app doesn't
// turn on, and one picture at a time is quick enough.
env.wasm.wasmPaths = { wasm }
env.wasm.numThreads = 1
