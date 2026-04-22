import { Express, RequestHandler } from "express";
import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { createBullBoard } from "@bull-board/api";

import { pdfQueue } from "../../queues/queue";
import { env } from "../../config/env";
import { basicAuth } from "../../middlewares/basic-auth.middleware";
import { logger } from "../../utils/logger";

const serverAdapter = new ExpressAdapter();

export function setupQueueDashboard(app: Express): void {
  createBullBoard({
    queues: [new BullMQAdapter(pdfQueue)],
    serverAdapter,
  });

  serverAdapter.setBasePath("/queues");

  const middlewares: RequestHandler[] = [];
  if (env.BULL_BOARD_USER && env.BULL_BOARD_PASSWORD) {
    middlewares.push(basicAuth(env.BULL_BOARD_USER, env.BULL_BOARD_PASSWORD));
  } else {
    logger.warn(
      "[BullBoard][setup] BULL_BOARD_USER / BULL_BOARD_PASSWORD not set — /queues dashboard is unauthenticated",
    );
  }

  app.use("/queues", ...middlewares, serverAdapter.getRouter());
}
