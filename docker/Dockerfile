# syntax=docker/dockerfile:1
# The release image: the API server and the built web app in one container (ADR 0001).
# Build from the repository root: docker build -f docker/Dockerfile .

# The build output is plain JavaScript and static files, so it is built once on the
# machine running the build and copied into the image for each CPU type.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
ENV TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src
# Download dependencies first, so changing the code doesn't download them again.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline && pnpm build

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 WEB_ROOT=/app/web
WORKDIR /app
# The server is bundled into one file with its dependencies; nothing is installed here.
COPY --from=build /src/apps/server/dist/index.js ./server.mjs
COPY --from=build /src/apps/web/dist ./web
COPY LICENSE ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s \
  CMD ["node", "-e", "fetch('http://localhost:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.mjs"]
