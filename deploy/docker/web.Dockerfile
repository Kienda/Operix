# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html ./
COPY src/ ./src/
ENV VITE_API_URL=/api/v1 VITE_OPERIX_EXPERIENCE=pilot
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30-alpine AS web
USER root
# Pick up Alpine security fixes published after the base tag was built.
RUN apk upgrade --no-cache --available
COPY deploy/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/operix-security-headers.conf
COPY --from=build /build/dist/ /usr/share/nginx/html/
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
