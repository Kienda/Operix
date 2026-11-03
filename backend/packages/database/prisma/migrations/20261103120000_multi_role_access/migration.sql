BEGIN;
-- Additive migration: preserve default roles and all existing membership state.
ALTER TABLE "Session" ADD COLUMN "activeRoleId" UUID;
CREATE UNIQUE INDEX "OrganizationUser_organizationId_id_key" ON "OrganizationUser"("organizationId", "id");
CREATE TABLE "MembershipRole" (
 "organizationId" UUID NOT NULL, "membershipId" UUID NOT NULL, "roleId" UUID NOT NULL,
 CONSTRAINT "MembershipRole_pkey" PRIMARY KEY ("membershipId", "roleId"),
 CONSTRAINT "MembershipRole_membership_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "OrganizationUser"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "MembershipRole_role_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MembershipRole_organizationId_roleId_idx" ON "MembershipRole"("organizationId", "roleId");
INSERT INTO "MembershipRole" ("organizationId", "membershipId", "roleId") SELECT "organizationId", "id", "roleId" FROM "OrganizationUser" WHERE "roleId" IS NOT NULL;
COMMIT;
