# Phase 3C release validation

The recovery changes are isolated on `fix/phase3c-staging-recovery-validation`, PR #10.
Do not merge or deploy without separate approval. Phase 3A/3B are complete and must
not be repeated. GitHub staging remains disabled; the unencrypted EC2 root volume
permits synthetic staging data only.

The first PR run, 39533148071, passed the full verification job and all five image
builds and functional smoke tests. Both dependency audits and the image scan gate
correctly failed on Vite 8.2.0's bundled launch-editor vulnerability
[CVE-2026-112942 / GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
The frontend audit additionally reported
[GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) and
[GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw).

The focused correction pins frontend Vite to 8.2.4 and overrides only vulnerable
backend Vite versions >=8.2.0 <8.2.4 to 8.2.4. Vitest's supported Vite 8 peer range
is preserved in compatibility; no Vitest, Prisma or Nest version changes are needed.
Vite's updated requirements also resolve PostCSS 8.5.31 and frontend Rolldown 1.2.14
with matching platform bindings / @oxc-project/types 0.154.0; frontend Nano ID resolves
3.3.20. These are regenerated dependency locks, not manual integrity edits. Both
unchanged local full dependency audit commands pass with no known vulnerabilities.
The complete CI pipeline must pass on the final PR head before acceptance.

The publishing job is deliberately main-only. An unmerged PR cannot produce a new
published staging release identifier or ECR digests. After separately approved merge,
the main workflow must rebuild, scan and publish all five unique immutable tags and
package the reviewed recovery scripts. Reverify the resulting manifest, archive
checksum and ECR digests before requesting deployment approval. Do not use the older
published release as evidence that these fixes are packaged, and do not widen the
publishing condition to bypass this boundary.
