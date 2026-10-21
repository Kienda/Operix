# syntax=docker/dockerfile:1.7
FROM node:26-trixie-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/* && npm install --global pnpm@11.1.3
WORKDIR /build/backend
COPY backend/ ./
RUN pnpm install --frozen-lockfile
RUN pnpm build --force
# deploy --legacy supports this repository's non-injected workspace packages.
RUN pnpm --filter @operix/api deploy --legacy --prod /out/api \
    && pnpm --filter @operix/worker deploy --legacy --prod /out/worker
# pnpm deploy omits Prisma's generated sibling directory. Copy the engine generated
# in this Linux build into each deployment's actual @prisma/client resolution.
COPY deploy/docker/copy-prisma.cjs /build/copy-prisma.cjs
RUN node /build/copy-prisma.cjs

# Distroless runtime: Node, glibc, OpenSSL and CA certificates only. No shell, package
# manager or OS utilities, which carried every remaining image-scan finding.
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS base
# Entrypoints and Compose health checks invoke `node` by name.
ENV PATH=/nodejs/bin:/usr/local/bin:/usr/bin:/bin NODE_ENV=production SEED_DEMO_DATA=false
COPY deploy/docker/runtime-env.cjs /opt/operix/runtime-env.cjs
USER nonroot

FROM base AS api
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out/api/ ./
EXPOSE 4000
ENTRYPOINT ["node", "--require", "/opt/operix/runtime-env.cjs"]
CMD ["dist/main.js"]

FROM base AS worker
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out/worker/ ./
# The worker is built and scanned but not enabled by the staging deployment.
ENTRYPOINT ["node", "--require", "/opt/operix/runtime-env.cjs"]
CMD ["dist/main.js"]

FROM base AS migrate
WORKDIR /build/backend/packages/database
# Prisma CLI is a dev dependency. Keep it in a dedicated one-shot image only.
COPY --from=build --chown=nonroot:nonroot /build/backend /build/backend
COPY deploy/docker/migrate.cjs /opt/operix/migrate.cjs
ENTRYPOINT ["node", "--require", "/opt/operix/runtime-env.cjs", "/opt/operix/migrate.cjs"]
