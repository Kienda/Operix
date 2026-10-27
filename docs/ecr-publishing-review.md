# Operix ECR publishing review

## Root cause and selected architecture

Workflow run 20 (`39193354860`, commit `646e6fa75e5cd299f26073bc9e3ff22efc99a97b`)
authenticated successfully and failed on `ecr:InitiateLayerUpload` for `operix-tunnel`:
the assumed ImagesRole has no identity policy allowing that repository. Run 19 also
failed publishing. This is an authorization mismatch, not an OIDC failure.

The deployed template export contains only the API, worker, migration and web ECR
repositories. Its ImagesRole push and InstanceOperixPolicy pull resource lists cover
only those four repositories. The current repository template adds TunnelRepository
and its ARN to both lists. The focused OIDC update intentionally excluded that addition;
correcting authentication alone cannot authorize the fifth image.

The fifth image is intentional for the selected staging ingress, documented in
`deploy/README.md`, `deploy/host.env.example`, `deploy/compose.tunnel.yml` and
`deploy/scripts/deploy.sh`. Cloudflared makes an outbound connection, reaches only
the web gateway through the ingress network and publishes no host ports. The four
application images remain unchanged. Removing the connector would break the selected
route or require a separately approved ingress design; changing Tontin's proxy is
outside scope. The workflow builds, scans and publishes the connector because the
Compose overlay consumes the release's `operix-tunnel` tag.

## Proposed correction; not applied

`deploy/aws/operix-staging.tunnel-proposal.json` extends the separately reviewed
`operix-staging.oidc-update.json`. Its only additional changes are:

1. Add retained, encrypted, immutable-tagged `TunnelRepository` named `operix-tunnel`,
   with scan-on-push and the existing seven-day untagged-image lifecycle rule.
2. Append its `Fn::GetAtt` ARN to the existing ImagesRole repository action statement.
3. Append the same ARN to the existing InstanceOperixPolicy pull action statement.

No IAM action lists, trust conditions, role names, other resource properties or outputs
change relative to the OIDC update. No `ecr:*` grant is added. The existing
`ecr:GetAuthorizationToken` action retains its required resource `*`; repository
operations remain restricted to specific repository ARNs. The EC2 pull list remains
`BatchCheckLayerAvailability`, `GetDownloadUrlForLayer`, and `BatchGetImage`.

The earlier four-image OIDC update remains separate and unchanged. When comparing this
proposal directly against the original deployed export, include that update's two
subject corrections and runtime-secret parameter default as well. Do not mistake
those carried-forward changes for new tunnel permissions.

Live repository existence and stack ownership are **unverified**: this process has no
AWS credentials. An authorized operator must first run these read-only checks in
`us-east-1`, using the correct account/profile:

```sh
aws ecr describe-repositories --region us-east-1 --repository-names operix-tunnel
aws cloudformation list-stack-resources --region us-east-1 --stack-name operix-staging
```

If the repository does not exist, the proposed addition is appropriate for review.
If it already exists outside this stack, do not attempt a conflicting creation: review
resource import or an exact ARN parameter/reference instead. If it is already managed
by this stack, retrieve a fresh deployed template and base a permission-only change
on it. Preserve its physical repository and existing tags. No replacements of existing
resources are expected from the proposed additions; confirm with a reviewed change set
after resolving live-state uncertainty. No change set or AWS update was executed here.

## Scan gate review

Both image scanning paths explicitly use `--scanners vuln --severity HIGH,CRITICAL
--exit-code 1`. The images job aggregates any failure and exits nonzero after scanning
all targets. Publishing uses `set -euo pipefail`, scans each image before pushing it,
and stops at scanner failure. There is no `continue-on-error`, advisory exclusion or
`--ignore-unfixed` in these paths. Release tags remain
`$GITHUB_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT`.

Runs 19 and 20 show no HIGH/CRITICAL CVE entries in their publish scan output; the
tunnel binary and Debian base each report zero findings in run 20. This is a statement
about the configured threshold and scan-time database, not an assertion of zero
vulnerabilities at every severity. Trivy uses distribution/vendor severity where
available, which can differ from NVD. The logs warn about fallback vendor severities
and Alpine 3.24 missing from the scanner's EOL list. Those are coverage/tooling warnings,
not vulnerability suppressions. See the official versioned documentation:
https://www.trivy.dev/docs/v0.61/guide/scanner/vulnerability/

No workflow, deployment switch, running service, Nginx or Tontin configuration was
changed as part of this review. The proposal is a review artifact, not authorization
to apply AWS changes.

## Validation

- All five Docker targets build successfully locally: API, worker, migrate, web and
  tunnel. Images are tagged `local/operix-<target>:ecr-review`; none were pushed.
- `rhysd/actionlint:1.7.7` accepts `.github/workflows/operix.yml`.
- CloudFormation `cfn-lint` 1.57.2 accepts both the current repository template and
  the separate tunnel proposal.
- All eight existing deployment contract tests pass.
- A structural comparison permits only the repository addition and the two exact
  ARN-list extensions relative to the OIDC update; all other content compares equal.
- Tests of the exact workflow shell scripts, with mocked Docker/AWS functions in
  disposable containers, confirm that a scanner error prevents any push. The image
  job still attempts all five scans and exits nonzero.
- Fresh scans using the CI version `aquasec/trivy:0.61.1` and a newly downloaded
  vulnerability database return exit 0 and zero HIGH/CRITICAL findings for each of
  API, worker, migrate, web and tunnel. Lower severities are outside this report's
  configured filter. The vendor-severity and Alpine EOL-list warnings remain.
- The real Trivy scanner returns exit 1 for the separate vulnerable-lockfile
  negative control, reporting HIGH findings CVE-2021-23337 and CVE-2026-4800.
  These are fixture findings, not findings in the Operix images. Together with the
  shell failure tests, this verifies the configured gate actually blocks findings.
- The tunnel image runs `--version` successfully with `--network none`, reporting
  cloudflared 2026.10.1. No connector was started.

Fresh scan reports and the isolated scanner negative control are stored under the
ignored `tmp/operix-ecr-review` directory. The negative control contains only a
vulnerable lockfile fixture; it does not install or execute that dependency.
