import { Worker } from 'bullmq';
import { prisma } from '@operix/database';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
const jobs = new Worker(
  'operix',
  async (job) => {
    if (job.name === 'notification.send') {
      const { organizationId, recordId, channel } = job.data as {
        organizationId: string;
        recordId: string;
        channel: string;
      };
      if (channel !== 'in_app') throw new Error('Notification channel is not implemented');
      const record = await prisma.businessRecord.findFirst({
        where: { id: recordId, organizationId, module: 'notifications' },
      });
      if (!record) throw new Error('Notification not found within tenant');
      await prisma.businessRecord.update({
        where: { id: record.id },
        data: {
          status: 'COMPLETED',
          data: { ...(record.data as object), channel, deliveredAt: new Date().toISOString() },
        },
      });
      return { delivered: true };
    }
    if (job.name === 'report.export' || job.name === 'document.render')
      return { queued: true, jobId: job.id };
    throw new Error(`Unsupported job ${job.name}`);
  },
  { connection },
);

jobs.on('failed', (job) =>
  console.error(JSON.stringify({ level: 'error', jobId: job?.id, error: 'job_failed' })),
);
process.on('SIGTERM', async () => {
  await jobs.close();
  await prisma.$disconnect();
  process.exit(0);
});
