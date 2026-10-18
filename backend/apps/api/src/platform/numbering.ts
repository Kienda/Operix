import { Prisma } from '@operix/database';

/** Server-assigned document numbers. The client never chooses them for these modules. */
export const NUMBER_FORMATS: Record<string, { prefix: string; yearly: boolean; width: number }> = {
  customers: { prefix: 'CUS', yearly: false, width: 5 },
  projects: { prefix: 'PRJ', yearly: true, width: 4 },
  tasks: { prefix: 'TSK', yearly: false, width: 5 },
  quotations: { prefix: 'QUO', yearly: true, width: 4 },
};

/**
 * Allocates the next number with a single atomic upsert. Inside a serializable
 * transaction a concurrent allocation conflicts and the whole command retries,
 * so a number is never issued twice and a rolled-back command does not leave a
 * half-written record behind.
 */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  module: string,
  now = new Date(),
): Promise<string> {
  const format = NUMBER_FORMATS[module];
  if (!format) throw new Error(`No numbering format for ${module}`);
  const year = now.getUTCFullYear();
  const key = format.yearly ? `${format.prefix}-${year}` : format.prefix;
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "NumberSequence" ("organizationId", "key", "value", "updatedAt")
    VALUES (${organizationId}::uuid, ${key}, 1, now())
    ON CONFLICT ("organizationId", "key")
    DO UPDATE SET "value" = "NumberSequence"."value" + 1, "updatedAt" = now()
    RETURNING "value"`;
  return `${key}-${String(row.value).padStart(format.width, '0')}`;
}
