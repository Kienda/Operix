-- Pilot access controls. Additive only: no existing row is rewritten except
-- that every existing membership is explicitly ACTIVE (its current behavior).
BEGIN;

-- Organization-level suspension of a member, independent of the global user.
ALTER TABLE "OrganizationUser"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedBy" UUID;
ALTER TABLE "OrganizationUser"
  ADD CONSTRAINT "OrganizationUser_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED')),
  ADD CONSTRAINT "OrganizationUser_suspension_check"
    CHECK (("status" = 'SUSPENDED') = ("suspendedAt" IS NOT NULL));
CREATE INDEX "OrganizationUser_organizationId_status_idx" ON "OrganizationUser"("organizationId", "status");

-- Atomic numbering; a sequence never moves backwards.
CREATE TABLE "NumberSequence" (
  "organizationId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("organizationId", "key"),
  CONSTRAINT "NumberSequence_value_check" CHECK ("value" >= 0)
);
ALTER TABLE "NumberSequence" ADD CONSTRAINT "NumberSequence_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One live invitation per organization/email, so a resend replaces rather than multiplies links.
CREATE UNIQUE INDEX "Invitation_pending_email_key" ON "Invitation"("organizationId", "email")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

COMMIT;
