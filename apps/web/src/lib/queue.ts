import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const invoiceParseQueue = new Queue("invoice-parse", { connection });

export async function enqueueParseJob(invoiceId: string) {
  await invoiceParseQueue.add(
    "parse",
    { invoiceId },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    }
  );
}
