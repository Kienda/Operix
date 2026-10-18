import { ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@operix/database';
import { setTimeout as delay } from 'node:timers/promises';

/** Retry the whole command, never a fragment of a financial/stock posting. */
export async function serializable<T>(
  db: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 10000,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034')
        throw error;
      await delay(5 * (attempt + 1) + Math.random() * 25);
    }
  }
  throw new ConflictException('Concurrent operation; retry the same request');
}
