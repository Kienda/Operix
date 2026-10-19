# syntax=docker/dockerfile:1.7
# Cloudflare Tunnel connector for restricted staging: outbound-only, no published ports,
# so the shared host's existing 80/443 proxy (Tontin) is never touched.
# The upstream image's Debian base carries libraries the static Go binary never loads,
# so only the binary is kept, on a base with no shell, package manager or libc.
FROM cloudflare/cloudflared:2026.10.1@sha256:a15a3b50b8dabd57ac2090e9484c0247dba9dfa1f0df4d298d4317f9d69eb2d5 AS source

FROM gcr.io/distroless/static-debian13:nonroot AS tunnel
COPY --from=source /usr/local/bin/cloudflared /usr/local/bin/cloudflared
USER nonroot
ENTRYPOINT ["/usr/local/bin/cloudflared", "--no-autoupdate"]
