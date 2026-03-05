import { Worker } from "bullmq";
import { connection } from "@/lib/queue";
import { processInvoice } from "./process-invoice";

const worker = new Worker("invoice-parse", processInvoice, { connection });

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed for invoice ${job.data.invoiceId}`);
});

worker.on("failed", (job, err) => {
  console.error(
    `Job ${job?.id} failed for invoice ${job?.data.invoiceId}:`,
    err.message
  );
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

console.log("Invoice parse worker started");

async function shutdown() {
  console.log("Shutting down worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
