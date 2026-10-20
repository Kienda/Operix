# Temporary internally built cloudflared

Operix temporarily builds `2026.10.2-operix.1` from official Cloudflare source because
the official 2026.10.1 and 2026.10.2 binaries embed `github.com/klauspost/compress`
v1.18.0 and fail the HIGH/CRITICAL image gate for CVE-2026-63209. This is an internally
built connector, not an official Cloudflare release or a fork of cloudflared.

## Provenance and dependency scope

- Official origin: https://github.com/cloudflare/cloudflared.git
- Release: https://github.com/cloudflare/cloudflared/releases/tag/2026.10.2
- Annotated tag object: `47cb4bc932a37b22dce0d14237e64322ad84686c`.
- Peeled source commit: `002a5ccaf75a4e612bfa451063c1d82a2d13336b`.
- Commit archive SHA-256: `91eb08b2924e92303a12ca7848be4c01d62b3ec701895bbd2caf5507d07b6c15`.
- The tag is unsigned. Verification uses the official HTTPS Git origin, matching
  release/tag/commit identity and the recorded archive hash; it is not a signature
  attestation by Cloudflare. Builds fetch the commit archive with `ADD --checksum`.
- Only `compress` changes: v1.18.0 to v1.18.7, with its two checksum entries added.
  All other requirements, replacements and selected module versions remain upstream.
  The Docker build checks both lockfile differences and the complete selected module
  graph, failing on any additional change. Historical upstream go.sum entries are
  retained; they do not imply that an older version is linked into the binary.
- Reviewed locks and module checksums: `deploy/docker/cloudflared/`. Downloads use
  `proxy.golang.org` with `sum.golang.org` verification; `go mod verify` must pass.
  The final binary's Go build metadata must report compress v1.18.7.

Pinned build inputs are in `deploy/docker/tunnel.Dockerfile`:

| Input | Immutable index digest |
| --- | --- |
| Dockerfile frontend 1.7 | `sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e` |
| Official Go 1.27.3 bookworm | `sha256:5c3e9b43cfd3bb95c7937462e29d87ada57b481a96fa23ad0eb61778d7a00110` |
| Distroless static Debian 13 nonroot | `sha256:516757106de35205efb70b91ba03f6f1298424a0678c603255cf2852a7000087` |

Go toolchain auto-download is disabled. The build uses CGO=0, readonly modules,
trimmed source paths, no VCS injection, an empty linker build ID and a fixed source
commit timestamp. It preserves upstream's container metrics setting. The runtime
keeps the standard CA bundle, upstream license, numeric UID/GID 65532, no shell or
package manager, and `--no-autoupdate`. Both linux/amd64 and linux/arm64 are supported.
Source/build provenance is included under `/usr/share/cloudflared/`.

## Validation and reproduction

```sh
docker build -f deploy/docker/tunnel.Dockerfile --target tunnel -t local/operix-tunnel:test .
docker build -f deploy/docker/tunnel.Dockerfile --target tunnel-tests -t local/operix-tunnel-tests:test .
docker run --rm --network none --cap-drop=ALL --security-opt=no-new-privileges:true \
  --sysctl 'net.ipv4.ping_group_range=0 0' local/operix-tunnel-tests:test
python deploy/tests/tunnel_smoke.py --image local/operix-tunnel:test
python -m unittest discover -s deploy/tests -v
docker save local/operix-tunnel:test -o image.tar
docker run --rm -v "$PWD/image.tar:/scan/image.tar:ro" aquasec/trivy:0.61.1 image \
  --input /scan/image.tar --scanners vuln --severity HIGH,CRITICAL --exit-code 1
```

The isolated test container's ping-group sysctl enables the upstream ICMP tests;
BuildKit RUN sandboxes disallow those sockets. This patch excludes no tests, adds no capabilities
are added, and no host or runtime sysctl is changed. The selected upstream suites
cover config, ingress (including ICMP), CLI utilities and validation.

The smoke test checks non-root execution, version reporting, valid and invalid
ingress configurations, route selection and invalid token-file rejection. Optional
`--quick` performs a real anonymous Quick Tunnel roundtrip to a disposable origin
that serves only a random nonce. It uses no production token, account or DNS zone,
publishes no host port, and removes its uniquely named containers/network on exit.
CI runs offline smoke tests; it does not create public tunnels.

For byte-identical OCI artifacts, normalize exporter timestamps and exclude variable
BuildKit attestations (not vulnerability scans) from this reproducibility comparison:

```sh
docker buildx build -f deploy/docker/tunnel.Dockerfile --target tunnel \
  --platform linux/amd64 --provenance=false \
  --output type=oci,dest=tunnel.oci.tar,rewrite-timestamp=true .
```

Repeat with `--no-cache-filter builder` and compare the manifest digest in the OCI
index. Ordinary CI release builds retain their default BuildKit provenance behavior;
their registry digest may differ from the normalized local artifact.

Local validation passed for all five release image builds and scans: each has zero
HIGH/CRITICAL findings with Trivy 0.61.1, and the tunnel's Go binary was scanned.
CVE-2026-63209 is absent. The normalized linux/amd64 OCI manifest is
`sha256:2859d521d8add08ac288950ba2d90082aaaaf9ed639fec5eedab6e88c07f029a`, identical
after an uncached builder rebuild. ARM64 build/emulated version, all four selected
upstream Go suites, the offline and real Quick Tunnel smoke checks, eight deployment
contracts, the existing application-image smoke suite, actionlint and ShellCheck pass.
The compact record is `deploy/docker/cloudflared/validation.json`; raw local reports
are in ignored `tmp/operix-compress-review/patched-scans/`. These results do not claim
that lower-severity findings are absent or that a registry deployment was performed.

## Security limits and return to upstream

Operix now owns this connector's build, patch review and retesting. There is no claim
of Cloudflare binary signature or official binary support for this internal build.
Pinned images prevent silent updates, so maintainers must deliberately refresh them
for future fixes and rerun every gate. Trivy's vendor-severity fallback and Alpine
EOL-list warnings are retained; lower severities are outside the configured gate.

The GitHub scan commands, HIGH/CRITICAL threshold and exit-code behavior are unchanged.
No CVE ignore, VEX exclusion, suppression or scanner downgrade is added. Release tags
remain commit/run/attempt-specific. IAM, CloudFormation and staging switches are unchanged.

When Cloudflare publishes a patched official image:

1. Verify its official tag, immutable digest and embedded compress version (at least
   v1.18.7); do not infer remediation solely from the release number.
2. Restore the official binary-copy source stage with a digest-pinned image, retaining
   a pinned non-root runtime and certificate trust. Remove the internal Go build/locks,
   internal version label and source-build-only tests in the same reviewed change.
3. Run both architecture checks, offline/optional Quick Tunnel tests, deployment
   contracts and all five HIGH/CRITICAL scans. Preserve the existing scan gate.
4. Submit a reviewed PR. Publishing or deploying still requires the existing controls;
   this patch does not authorize AWS, DNS or server changes.
