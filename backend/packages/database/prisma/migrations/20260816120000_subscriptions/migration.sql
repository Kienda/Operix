CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL','AWAITING_PAYMENT','PENDING_VERIFICATION','ACTIVE','EXPIRING_SOON','EXPIRED','SUSPENDED','CANCELLED');

CREATE TABLE "SubscriptionPlan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "key" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "currency" TEXT NOT NULL DEFAULT 'USD', "sixMonthPrice" DECIMAL(18,2) NOT NULL,
  "twentyFourMonthDiscount" DECIMAL(5,2) NOT NULL DEFAULT 10, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubscriptionPlan_key_key" ON "SubscriptionPlan"("key");

CREATE TABLE "Subscription" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL, "planId" UUID NOT NULL,
  "periodMonths" INTEGER NOT NULL, "status" "SubscriptionStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "basePrice" DECIMAL(18,2) NOT NULL, "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "effectivePrice" DECIMAL(18,2) NOT NULL, "currency" TEXT NOT NULL, "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3), "graceEndsAt" TIMESTAMP(3), "paymentMethod" TEXT, "paymentReference" TEXT,
  "amountReceived" DECIMAL(18,2), "paymentNotes" TEXT, "approvedBy" UUID, "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT
);
CREATE INDEX "Subscription_organizationId_status_endsAt_idx" ON "Subscription"("organizationId","status","endsAt");

CREATE TABLE "SubscriptionHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL, "subscriptionId" UUID NOT NULL,
  "actorId" UUID NOT NULL, "action" TEXT NOT NULL, "fromStatus" "SubscriptionStatus", "toStatus" "SubscriptionStatus" NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "SubscriptionHistory_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT
);
CREATE INDEX "SubscriptionHistory_organizationId_createdAt_idx" ON "SubscriptionHistory"("organizationId","createdAt");
CREATE INDEX "SubscriptionHistory_subscriptionId_createdAt_idx" ON "SubscriptionHistory"("subscriptionId","createdAt");
