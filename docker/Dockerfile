# syntax=docker/dockerfile:1
# The release image: the API server and the built web app in one container (ADR 0001).
# Build from the repository root: docker build -f docker/Dockerfile .
#
# Debian rather than Alpine: text recognition (SEC-05) runs ONNX Runtime, whose native
# library is built for glibc only.

# The build output is plain JavaScript and static files, so it is built once on the
# machine running the build and copied into the image for each CPU type.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
ENV TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src
# Download dependencies first, so changing the code doesn't download them again. The
# native packages of text recognition are fetched for both CPU types the image is
# built for, whichever machine runs the build.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN printf '\nsupportedArchitectures:\n  os: [current, linux]\n  cpu: [current, x64, arm64]\n  libc: [current, glibc]\n' >> pnpm-workspace.yaml \
  && pnpm fetch
COPY . .
RUN printf '\nsupportedArchitectures:\n  os: [current, linux]\n  cpu: [current, x64, arm64]\n  libc: [current, glibc]\n' >> pnpm-workspace.yaml \
  && pnpm install --frozen-lockfile --offline && pnpm build

# The server bundle leaves out the packages with native code; this stage gathers them
# for the CPU type of the image and drops the other platforms' libraries.
FROM build AS server-modules
ARG TARGETARCH
RUN pnpm --filter @repo/server deploy --prod --legacy /out \
  && arch=$([ "$TARGETARCH" = arm64 ] && echo arm64 || echo x64) \
  && other=$([ "$arch" = arm64 ] && echo x64 || echo arm64) \
  && cd /out/node_modules/.pnpm \
  && rm -rf onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*/darwin \
    onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*/win32 \
    onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*/linux/$other \
    @napi-rs+canvas-linux-$other-* @napi-rs+canvas-*-musl@* @electric-sql+pglite@*
# The text recognition models (MODELS.md), from the npm package the lockfile pins.
RUN mkdir -p /models \
  && models=$(dirname $(cd apps/server && node -p "require.resolve('paddle-ocr-onnx-models/package.json')"))/models \
  && cp "$models/ch_PP-OCRv4_det_infer.onnx" /models/detection.onnx \
  && cp "$models/en_PP-OCRv4_rec.onnx" /models/recognition.onnx \
  && cp apps/server/models/dictionary.txt /models/dictionary.txt

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 WEB_ROOT=/app/web MIGRATIONS_DIR=/app/migrations OCR_MODELS_DIR=/app/models
WORKDIR /app
# The server and its text recognition worker, bundled, beside the native packages.
COPY --from=server-modules /out/node_modules ./node_modules
COPY --from=server-modules /models ./models
COPY --from=build /src/apps/server/dist/ ./
# It brings its database up to date at every start.
COPY --from=build /src/apps/server/drizzle ./migrations
COPY --from=build /src/apps/web/dist ./web
COPY LICENSE MODELS.md ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s \
  CMD ["node", "-e", "fetch('http://localhost:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "index.mjs"]
