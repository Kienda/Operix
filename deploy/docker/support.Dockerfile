# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# Verified internal supporting images. Publication and host deployment need separate approval.
ARG SOURCE_DATE_EPOCH=1792485048
FROM --platform=$BUILDPLATFORM golang:1.27.3-bookworm@sha256:972b4110ba0f47539a975c31e52c64765e1ff19f2d74469ae4a595c6676e80a5 AS gosu-builder
ENV GOTOOLCHAIN=local CGO_ENABLED=0 GOPROXY=https://proxy.golang.org GOSUMDB=sum.golang.org
WORKDIR /src
ADD --checksum=sha256:33d7537d588ea49458b9509bcf4554bdf5ceacc66da71e5caa1058ea3b689c3b https://codeload.github.com/tianon/gosu/tar.gz/6456aaa0f3c854d199d0f037f068eb97515b7513 /source.tar.gz
RUN tar -xzf /source.tar.gz --strip-components=1 -C /src && rm /source.tar.gz
COPY deploy/docker/support/go.mod deploy/docker/support/go.sum deploy/docker/support/locks.sha256 /locks/
RUN cmp go.mod /locks/go.mod && cmp go.sum /locks/go.sum \
    && cd /locks && sha256sum -c locks.sha256 \
    && cd /src && go mod download && go mod verify && go test -mod=readonly ./...
ARG TARGETOS
ARG TARGETARCH
# Preserve symbols/build metadata for vulnerability analysis (do not use -s).
RUN test "$TARGETOS" = linux && case "$TARGETARCH" in amd64|arm64) ;; *) exit 1;; esac \
    && GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -mod=readonly -trimpath -buildvcs=false \
      -ldflags='-w -buildid=' -o /out/gosu . \
    && go version -m /out/gosu | tee /out/build-info.txt \
    && grep -q 'go1.27.3' /out/build-info.txt \
    && cmp go.mod /locks/go.mod && cmp go.sum /locks/go.sum

FROM postgres:18.6-alpine3.24@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5 AS postgres-candidate
COPY --from=gosu-builder --chmod=0755 /out/gosu /usr/local/bin/gosu
COPY --from=gosu-builder /out/build-info.txt /usr/local/share/operix/gosu-build-info.txt
# Preserve Alpine's upstream UID/GID (70). GID 999 belongs to ping on this base;
# never repurpose it. Physical reuse of Bookworm databases is not authorized.
RUN test "$(id -u postgres)" = 70 && test "$(id -g postgres)" = 70 \
    && gosu --version | grep -q '1.19 (go1.27.3' \
    && test "$(gosu postgres id -u)" = 70
LABEL org.opencontainers.image.title="Operix internal PostgreSQL 16.15 candidate" \
      org.opencontainers.image.version="16.15-operix.1" \
      io.operix.gosu.source="6456aaa0f3c854d199d0f037f068eb97515b7513" \
      io.operix.adoption="fresh volume or separately approved logical restore"

FROM scratch AS redis-packages
ADD --checksum=sha256:3c6fb1c90a974ef0fc83687868712340ca3df3ef5206cfc79fd81ff16f22596a https://dl-cdn.alpinelinux.org/alpine/v3.21/main/x86_64/libcrypto3-3.3.7-r2.apk /amd64/libcrypto3.apk
ADD --checksum=sha256:00e674d00a80c9808580546dd388093c1c67f21628a9d70e27628bddc86a31e8 https://dl-cdn.alpinelinux.org/alpine/v3.21/main/x86_64/libssl3-3.3.7-r2.apk /amd64/libssl3.apk
ADD --checksum=sha256:2303cca13dc8bba5798744a68abd07530abb35ab339d9cc4640fc53276049af0 https://dl-cdn.alpinelinux.org/alpine/v3.21/main/aarch64/libcrypto3-3.3.7-r2.apk /arm64/libcrypto3.apk
ADD --checksum=sha256:d494a0a211dd78a8055c24885fc06375eabb79c82ae797f7f694cefbf3653b79 https://dl-cdn.alpinelinux.org/alpine/v3.21/main/aarch64/libssl3-3.3.7-r2.apk /arm64/libssl3.apk

FROM redis:8.0.6-alpine3.21@sha256:5f61955be8ab2ccee9372b84ae4d4da2e2b156f87281e3f218544055e7ee04d4 AS redis-candidate
ARG TARGETARCH
# Local APKs are checksum-pinned above AND verified against the base's Alpine keys.
# No --allow-untrusted, repository rewrite, general upgrade, or other package changes.
RUN --network=none --mount=from=redis-packages,target=/packages,readonly \
    case "$TARGETARCH" in amd64|arm64) ;; *) exit 1;; esac \
    && apk info -v | sort > /tmp/packages.before \
    && apk add --no-cache --no-network "/packages/$TARGETARCH/libcrypto3.apk" "/packages/$TARGETARCH/libssl3.apk" \
    && apk info -v | sed -e 's/^libcrypto3-3.3.7-r2$/libcrypto3-3.3.7-r1/' \
      -e 's/^libssl3-3.3.7-r2$/libssl3-3.3.7-r1/' | sort | cmp - /tmp/packages.before \
    && apk info -v | grep -qx 'libcrypto3-3.3.7-r2' \
    && apk info -v | grep -qx 'libssl3-3.3.7-r2' \
    && rm /tmp/packages.before
LABEL org.opencontainers.image.title="Operix internal Redis 7.4.11 candidate" \
      org.opencontainers.image.version="7.4.11-operix.1" \
      io.operix.openssl.packages="libcrypto3=3.3.7-r2,libssl3=3.3.7-r2" \
      io.operix.adoption="candidate-only; separate publication approval required"
