# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# Cloudflare Tunnel connector for restricted staging: outbound-only, no published ports,
# so the shared host's existing 80/443 proxy (Tontin) is never touched.
# Temporary internal build: official 2026.10.2 source, only compress patched to 1.18.7.
# See deploy/docker/cloudflared/provenance.json and docs/cloudflared-security-patch.md.
ARG SOURCE_DATE_EPOCH=1792485048
FROM --platform=$BUILDPLATFORM golang:1.27.3-bookworm@sha256:5c3e9b43cfd3bb95c7937462e29d87ada57b481a96fa23ad0eb61778d7a00110 AS builder
ENV GOTOOLCHAIN=local CGO_ENABLED=0 GOPROXY=https://proxy.golang.org GOSUMDB=sum.golang.org
WORKDIR /src
ADD --checksum=sha256:91eb08b2924e92303a12ca7848be4c01d62b3ec701895bbd2caf5507d07b6c15 https://codeload.github.com/cloudflare/cloudflared/tar.gz/002a5ccaf75a4e612bfa451063c1d82a2d13336b /source.tar.gz
RUN tar -xzf /source.tar.gz --strip-components=1 -C /src && rm /source.tar.gz \
    && cp go.mod /tmp/upstream.mod && cp go.sum /tmp/upstream.sum \
    && go list -mod=readonly -m all > /tmp/upstream-graph
COPY deploy/docker/cloudflared/go.mod deploy/docker/cloudflared/go.sum deploy/docker/cloudflared/locks.sha256 ./
RUN sed 's@github.com/klauspost/compress v1.18.0@github.com/klauspost/compress v1.18.7@' /tmp/upstream.mod | cmp - go.mod \
    && grep -v '^github.com/klauspost/compress v1.18.7' go.sum | cmp - /tmp/upstream.sum \
    && sha256sum -c locks.sha256 && go mod download && go mod verify \
    && go list -mod=readonly -m all > /tmp/patched-graph \
    && sed 's@github.com/klauspost/compress v1.18.0@github.com/klauspost/compress v1.18.7@' /tmp/upstream-graph | cmp - /tmp/patched-graph \
    && sha256sum -c locks.sha256
ARG TARGETOS
ARG TARGETARCH
RUN test "$TARGETOS" = linux && case "$TARGETARCH" in amd64|arm64) ;; *) echo 'Unsupported target architecture' >&2; exit 1;; esac \
    && GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -mod=readonly -trimpath -buildvcs=false \
      -ldflags='-buildid= -X main.Version=2026.10.2-operix.1 -X main.BuildTime=2026-10-20T08:30:48Z -X github.com/cloudflare/cloudflared/metrics.Runtime=virtual' \
      -o /out/cloudflared ./cmd/cloudflared \
    && sha256sum -c locks.sha256 \
    && go version -m /out/cloudflared | tee /out/build-info.txt \
    && grep -Eq 'github.com/klauspost/compress[[:space:]]+v1.18.7[[:space:]]' /out/build-info.txt

FROM builder AS tunnel-tests
# Upstream ICMP tests need a namespaced ping_group_range; set it only on docker run.
CMD ["go", "test", "-mod=readonly", "-count=1", "./config", "./ingress", "./cmd/cloudflared/cliutil", "./validation"]

FROM gcr.io/distroless/static-debian13:nonroot@sha256:516757106de35205efb70b91ba03f6f1298424a0678c603255cf2852a7000087 AS tunnel
LABEL org.opencontainers.image.source="https://github.com/cloudflare/cloudflared" \
      org.opencontainers.image.revision="002a5ccaf75a4e612bfa451063c1d82a2d13336b" \
      org.opencontainers.image.version="2026.10.2-operix.1" \
      io.operix.cloudflared.patch="compress-v1.18.7-CVE-2026-63209"
COPY --from=builder /out/cloudflared /usr/local/bin/cloudflared
COPY --from=builder /out/build-info.txt /usr/share/cloudflared/build-info.txt
COPY --from=builder /src/LICENSE /usr/share/licenses/cloudflared/LICENSE
COPY deploy/docker/cloudflared/provenance.json /usr/share/cloudflared/provenance.json
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/cloudflared", "--no-autoupdate"]
