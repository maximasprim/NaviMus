import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import type { DomainEventMap, DomainEventName } from "./contracts.js";

const logger = createServiceLogger("events");

/**
 * ioredis connection shared by every queue this process opens.
 * BullMQ requires maxRetriesPerRequest: null on the connection it
 * manages queues with.
 */
function createEventsConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

const queueCache = new Map<string, Queue>();

function getQueue(eventName: string, connection: Redis): Queue {
  const existing = queueCache.get(eventName);
  if (existing) return existing;
  const queue = new Queue(eventName, { connection });
  queueCache.set(eventName, queue);
  return queue;
}

/**
 * Publishes a domain event. Call this AFTER the originating DB
 * transaction has committed - never from inside it - so a queue
 * failure can't roll back a booking/payment that actually
 * succeeded, and so consumers never see an event for a row that
 * turns out not to exist.
 */
export class EventPublisher {
  private readonly connection: Redis;

  constructor(connection?: Redis) {
    this.connection = connection ?? createEventsConnection();
  }

  /**
   * Publishes a domain event. Call this AFTER the originating DB
   * transaction has committed - never from inside it - so a queue
   * failure can't roll back a booking/payment that actually
   * succeeded, and so consumers never see an event for a row that
   * turns out not to exist.
   *
   * `delayMs` schedules delivery in the future (e.g. trip
   * reminders) instead of firing immediately - BullMQ holds the
   * job and only makes it visible to a Worker once the delay
   * elapses.
   */
  async publish<E extends DomainEventName>(
    eventName: E,
    payload: DomainEventMap[E],
    opts: { delayMs?: number; jobId?: string } = {}
  ): Promise<void> {
    try {
      const queue = getQueue(eventName, this.connection);
      await queue.add(eventName, payload, {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
        delay: opts.delayMs,
        // A stable jobId makes re-scheduling idempotent: adding the same
        // jobId twice is a no-op rather than a duplicate reminder.
        jobId: opts.jobId,
      });
    } catch (err) {
      // A failed publish should never crash the request that just
      // successfully booked/paid - log loudly and move on. This is
      // an at-least-once system, not exactly-once; consumers must
      // be idempotent (see notification_logs dedup).
      logger.error({ err, eventName }, "Failed to publish domain event");
    }
  }

  async close(): Promise<void> {
    for (const queue of queueCache.values()) {
      await queue.close();
    }
    await this.connection.quit();
  }
}
