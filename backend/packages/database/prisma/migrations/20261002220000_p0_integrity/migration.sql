-- Atomic, non-destructive migration. Invalid historical data aborts deployment
-- for reconciliation; this migration never invents payments or stock movements.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Invoice" i WHERE i.paid <> COALESCE((SELECT sum(a.amount) FROM "PaymentAllocation" a JOIN "Payment" p ON p.id=a."paymentId" WHERE a."invoiceId"=i.id AND p.status='VERIFIED'),0)) THEN
    RAISE EXCEPTION 'P0 preflight: reconcile invoice paid balances before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "PaymentAllocation" a JOIN "Payment" p ON p.id=a."paymentId" JOIN "Invoice" i ON i.id=a."invoiceId" WHERE p.currency<>i.currency OR p."customerId"<>i."customerId" OR p."organizationId"<>i."organizationId") THEN
    RAISE EXCEPTION 'P0 preflight: invalid payment allocation references';
  END IF;
  IF EXISTS (SELECT 1 FROM "Payment" p WHERE p.amount < (SELECT COALESCE(sum(a.amount),0) FROM "PaymentAllocation" a WHERE a."paymentId"=p.id)) THEN
    RAISE EXCEPTION 'P0 preflight: allocations exceed payment amount';
  END IF;
  IF EXISTS (SELECT 1 FROM "InventoryMovement" WHERE type IN ('TRANSFER','RESERVATION')) THEN
    RAISE EXCEPTION 'P0 preflight: legacy transfers/reservations require reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM "InventoryItem" i WHERE EXISTS (SELECT 1 FROM "InventoryMovement" m WHERE m."itemId"=i.id) AND i.quantity <> (SELECT sum(CASE WHEN m.type IN ('INITIAL','PURCHASE_RECEIPT','RETURN','ADJUSTMENT') THEN m.quantity ELSE -abs(m.quantity) END) FROM "InventoryMovement" m WHERE m."itemId"=i.id)) THEN
    RAISE EXCEPTION 'P0 preflight: reconcile inventory movement balances before migration';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "OrganizationUser" DROP CONSTRAINT "OrganizationUser_roleId_fkey";
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_roleId_fkey";

-- DropForeignKey
ALTER TABLE "BusinessRecord" DROP CONSTRAINT "BusinessRecord_branchId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_branchId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_branchId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_branchId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_itemId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingMfaExpiresAt" TIMESTAMP(3),
ADD COLUMN     "pendingMfaSecret" TEXT,
ADD COLUMN     "pendingMfaSessionId" UUID;

-- AlterTable
ALTER TABLE "OrganizationUser" ADD COLUMN     "customerId" UUID,
ADD COLUMN     "employeeId" UUID;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "dataScope" TEXT NOT NULL DEFAULT 'self',
ADD COLUMN     "systemKey" TEXT;

-- AlterTable
ALTER TABLE "PaymentAllocation" ADD COLUMN "organizationId" UUID;
UPDATE "PaymentAllocation" a SET "organizationId"=p."organizationId" FROM "Payment" p WHERE p.id=a."paymentId";
ALTER TABLE "PaymentAllocation" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "openingQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0;
-- Explicit carry-forward only for historical items with no transaction history.
UPDATE "InventoryItem" i SET "openingQuantity"=quantity WHERE NOT EXISTS (SELECT 1 FROM "InventoryMovement" m WHERE m."itemId"=i.id);

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_organizationId_id_key" ON "Branch"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_id_key" ON "Role"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRecord_organizationId_id_key" ON "BusinessRecord"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_id_key" ON "Invoice"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_id_key" ON "Payment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_organizationId_id_key" ON "InventoryItem"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_organizationId_itemId_idempotencyKey_key" ON "InventoryMovement"("organizationId", "itemId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "OrganizationUser" ADD CONSTRAINT "OrganizationUser_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUser" ADD CONSTRAINT "OrganizationUser_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "BusinessRecord"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUser" ADD CONSTRAINT "OrganizationUser_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "BusinessRecord"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRecord" ADD CONSTRAINT "BusinessRecord_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "BusinessRecord"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "BusinessRecord"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_organizationId_paymentId_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "Payment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_organizationId_invoiceId_fkey" FOREIGN KEY ("organizationId", "invoiceId") REFERENCES "Invoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_organizationId_itemId_fkey" FOREIGN KEY ("organizationId", "itemId") REFERENCES "InventoryItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Role" ADD CONSTRAINT "Role_dataScope_check" CHECK ("dataScope" IN ('all','branch','assigned','self','customer'));
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_check" CHECK (subtotal>=0 AND tax>=0 AND total=subtotal+tax AND paid>=0 AND paid<=total);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK (amount>0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_check" CHECK (amount>0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_balances_check" CHECK (quantity>=0 AND reserved>=0 AND reserved<=quantity AND "openingQuantity">=0 AND "minimumStock">=0 AND cost>=0);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_quantity_check" CHECK ((type='ADJUSTMENT' AND quantity<>0) OR (type<>'ADJUSTMENT' AND quantity>0));
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_balance_check" CHECK ("balanceAfter">=0);

UPDATE "Role" r SET "systemKey"=v.key, "dataScope"=v.scope FROM (VALUES
  ('platform_super_admin', 'Platform Super Admin', 'all'),
  ('platform_support_admin', 'Platform Support Admin', 'all'),
  ('company_owner', 'Company Owner', 'all'),
  ('company_admin', 'Company Administrator', 'all'),
  ('branch_manager', 'Branch Manager', 'branch'),
  ('finance_manager', 'Finance Manager', 'all'),
  ('accountant', 'Accountant', 'all'),
  ('sales_manager', 'Sales Manager', 'all'),
  ('sales_representative', 'Sales Representative', 'assigned'),
  ('customer_service_agent', 'Customer Service Agent', 'branch'),
  ('project_manager', 'Project Manager', 'assigned'),
  ('designer', 'Designer', 'assigned'),
  ('developer', 'Developer', 'assigned'),
  ('marketing_manager', 'Marketing Manager', 'branch'),
  ('production_manager', 'Production Manager', 'branch'),
  ('printer_operator', 'Printer Operator', 'assigned'),
  ('inventory_manager', 'Inventory Manager', 'branch'),
  ('purchasing_officer', 'Purchasing Officer', 'branch'),
  ('hr_manager', 'Human Resources Manager', 'all'),
  ('payroll_manager', 'Payroll Manager', 'all'),
  ('security_supervisor', 'Security Supervisor', 'branch'),
  ('security_guard', 'Security Guard', 'self'),
  ('technician', 'Technician', 'assigned'),
  ('installer', 'Installer', 'assigned'),
  ('driver', 'Driver', 'assigned'),
  ('auditor', 'Auditor', 'all'),
  ('readonly_user', 'Read-only User', 'branch'),
  ('employee', 'Employee', 'self'),
  ('customer', 'Customer', 'customer')
) AS v(key,name,scope) WHERE r."isSystem"=true AND r.name=v.name;
COMMIT;
