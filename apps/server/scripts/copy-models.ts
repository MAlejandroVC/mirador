// Puts the text recognition models where the server looks for them in development
// (apps/server/models). The release image copies the same files (docker/Dockerfile).
// They come from an npm package, so the lockfile pins their exact bytes. See MODELS.md.
import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const source = join(dirname(require.resolve('paddle-ocr-onnx-models/package.json')), 'models')
const target = fileURLToPath(new URL('../models/', import.meta.url))
await copyFile(join(source, 'ch_PP-OCRv4_det_infer.onnx'), join(target, 'detection.onnx'))
await copyFile(join(source, 'en_PP-OCRv4_rec.onnx'), join(target, 'recognition.onnx'))
console.log(`Text recognition models copied to ${target}`)
