# Bundled models

Mirador runs text recognition on the user's own server, in memory, with bundled, pre-trained model files (IMP-11, SEC-05). Category suggestions (IMP-24), if added, will use a pre-trained model that runs in the browser, since the server cannot read past transactions. Every model file in the repository or the Docker image is listed here with its source, version and license, and must be compatible with AGPL-3.0.

| File | Used for | Source | Version | License |
| --- | --- | --- | --- | --- |
| `models/detection.onnx` | Finding lines of text in a picture (PP-OCRv4 detection) | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), converted to ONNX by [RapidOCR](https://huggingface.co/SWHL/RapidOCR) and published on npm as `paddle-ocr-onnx-models` (file `ch_PP-OCRv4_det_infer.onnx`) | npm 0.2.0, pinned by `pnpm-lock.yaml` | Apache-2.0 |
| `models/recognition.onnx` | Reading each line (PP-OCRv4 English and digits) | Same package, file `en_PP-OCRv4_rec.onnx` | npm 0.2.0, pinned by `pnpm-lock.yaml` | Apache-2.0 |
| `models/dictionary.txt` | The characters the recognition model writes, in its order | PaddleOCR's `en_dict.txt`, committed at `apps/server/models/dictionary.txt` | PaddleOCR 2.x | Apache-2.0 |

The release image copies these into `/app/models` (`docker/Dockerfile`). In development, `pnpm --filter @repo/server models` copies the two model files into `apps/server/models`; without them the server runs with reading pictures turned off.

The recognition model reads English letters, digits and punctuation, so accents are dropped ("Descripción" is read as "Descripcion"); names compare without accents, so matching and categories are not affected. A multilingual model (PP-OCRv5 Latin or PP-OCRv6) can replace it by swapping these two files and the dictionary.
