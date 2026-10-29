import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

/**
 * Base structured logger. In production this emits plain JSON
 * (for log aggregators); in development it pretty-prints.
 * Never log secrets, tokens, passwords, or full card/payment
 * payloads - redact paths are enforced below for common cases.
 */
export const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.password_hash",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.cardNumber",
      "*.cvv",
      "*.mpesaPasskey",
      "*.stripeSecretKey",
    ],
    censor: "[REDACTED]",
  },
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
});

export type Logger = typeof baseLogger;

/**
 * Creates a child logger scoped to a service name, and optionally
 * a request id so every log line in a request's lifecycle can be
 * correlated. Pass this down through service/repository layers
 * instead of importing baseLogger directly everywhere.
 */
export function createServiceLogger(serviceName: string): Logger {
  return baseLogger.child({ service: serviceName });
}

export function withRequestId(logger: Logger, requestId: string): Logger {
  return logger.child({ requestId });
}

/**
 * Tags every subsequent log line from this logger with which tenant it
 * concerns - the single highest-value addition for debugging a
 * multi-tenant system: "which tenant hit this 500" or "which tenant's
 * booking failed" turns a log search across every tenant's traffic into
 * a search scoped to one. Compose with withRequestId (order doesn't
 * matter - both are just child-logger bindings) to get both on the same
 * line: `withTenant(withRequestId(logger, requestId), tenantId)`.
 */
export function withTenant(logger: Logger, tenantId: string): Logger {
  return logger.child({ tenantId });
}
