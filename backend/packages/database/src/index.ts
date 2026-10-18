export { Prisma, PrismaClient } from '@prisma/client';
export * from '@prisma/client';

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var operixPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.operixPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalThis.operixPrisma = prisma;
