# Application releases with retained supporting images

The existing storage guard correctly rejects a PostgreSQL or Redis digest change.
Every build carries the application commit in its OCI revision label, so rebuilding
unchanged supporting sources for an application-only commit can change their image
identities. Build attestations can also change an outer registry digest. Neither is
permission to change the live database images or rewrite their storage marker.

The publication workflow now explicitly uses:

```sh
python3 deploy/scripts/release-images.py publish --retain-support
```

`support-images.lock.json` retains the two exact supporting artifacts from release
`2d899cb8f3eab63f2b197a7e04e2efb8aa9ff7a5-39704047009-2`. It records their original
ECR digest references, unchanged storage contract, and SHA256 checksums of the
supporting Dockerfile, every supporting dependency/provenance lock, and both
database startup scripts. Checksums use canonical LF text, matching GitHub's Linux
checkout. Changed inputs, account, repository, mutable references, or incomplete
locks require a new review; environment variables cannot override this lock.

Publication remains separately approved on `main` and depends on successful verify,
security, and images jobs. It performs these checks before any push:

1. Build all seven candidates and run the existing synthetic persistence/restore,
   application/migration, and tunnel smoke checks.
2. Scan all seven candidates using the unchanged digest-pinned Trivy 0.61.1 image,
   `HIGH,CRITICAL`, and `--exit-code 1`.
3. Verify each retained digest against its recorded source-release ECR tag using
   the existing repository-scoped `BatchGetImage` permission, then pull by digest.
4. Run the complete disposable application/migration smoke against the five new
   application image content IDs and the **two retained image content IDs**.
   Selected-image smoke is CI-only and rejects missing images, tag substitutions,
   conflicting candidate mode, or content-identity mismatches.
5. Scan all seven selected content IDs again. Build, pull, smoke, scanner, or source
   readback errors prevent every push. There is no fallback to a different image.

Only the five new application images receive new immutable release tags. The two
supporting references retain their original digests and provenance; they are not
relabeled as newly built artifacts. After pushing, all seven selected registry
references are pulled, compared with the exact tested content IDs, and scanned
again. Only then is the seven-image manifest written and packaged under a new
commit/run/attempt release identity. Existing published archives are never edited.
Post-push verification failures prevent release packaging, although partial
immutable application tags can remain and must not be reused or overwritten.

PR verification intentionally keeps all existing seven-image build, scan,
provenance, compatibility, and security gates. It has no AWS credentials and cannot
pull the private retained ECR artifacts. Their exact selected-image smoke and scans
occur in the separately approved main publication job; a green PR alone does not
claim those private-artifact checks have run.

`image-manifest.py`, `support-storage.py`, host receiver, deployment script,
storage marker, volumes, credentials, IAM, and CloudFormation are unchanged.
The new manifest must match the live storage marker exactly before deployment.
Application rollback still requires identical migration fingerprints, credential
fingerprints, and supporting-image identities. A same-major database upgrade,
credential rotation, storage transition, or changed migration fingerprint remains
a separate compatibility and deployment review.

Publication does not itself deploy containers or remove Cloudflare Access. Keep
the staging deployment switch disabled until a specific deployment is approved.
Tontin and unrelated infrastructure are outside this release path.
