import { Express } from "express";
import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { createBullBoard } from "@bull-board/api";

import { pdfQueue } from "../../queues/queue";

const serverAdapter = new ExpressAdapter();

export function setupQueueDashboard(app: Express): void {
  createBullBoard({
    queues: [new BullMQAdapter(pdfQueue)],
    serverAdapter,
  });

  serverAdapter.setBasePath("/queues");
  app.use("/queues", serverAdapter.getRouter());
}
