import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb, runInTenantContext } from "@travel/database";
import type { DomainEventMap, DomainEventName } from "./contracts.js";

const logger = createServiceLogger("events");

/**
 * Registers a handler for one event name. Each call creates its
 * own BullMQ Worker (one per event type, matching the one-queue-
 * per-event-name convention in publisher.ts). Handlers must be
 * idempotent - BullMQ's at-least-once delivery plus our own retry
 * policy means a handler can run more than once for the same job.
 *
 * Every handler runs inside the event's tenant context (all payloads carry
 * tenantId), so row-level security confines whatever database access it makes
 * to that tenant - exactly as for an HTTP request. A payload without a
 * tenantId fails the job rather than running with no context, where RLS would
 * make every query quietly return nothing. Uses its own small pool so slow
 * jobs (email/SMS sends) can't starve API requests of connections.
 */
export function subscribe<E extends DomainEventName>(
  eventName: E,
  handler: (payload: DomainEventMap[E], job: Job) => Promise<void>,
  opts: { concurrency?: number } = {}
): Worker {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const db = createDb(env.DATABASE_URL, { name: "events", poolMax: env.EVENTS_DB_POOL_MAX });

  const worker = new Worker(
    eventName,
    async (job: Job) => {
      const tenantId = (job.data as { tenantId?: string } | undefined)?.tenantId;
      if (!tenantId) {
        throw new Error(`Event "${eventName}" (job ${job.id}) has no tenantId; refusing to run without a tenant context`);
      }
      await runInTenantContext(db, tenantId, () => handler(job.data, job));
    },
    { connection, concurrency: opts.concurrency ?? 5 }
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, eventName, jobId: job?.id, attempts: job?.attemptsMade }, "Event handler failed");
  });

  return worker;
}

export * from "./contracts.js";
export * from "./publisher.js";
