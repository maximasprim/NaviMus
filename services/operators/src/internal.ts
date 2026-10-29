/**
 * The function every operator-scoped write route (Packages,
 * Accommodation, Transport) should call instead of trusting the
 * caller's own user id as operatorId. Transfers is intentionally
 * excluded - airport transfers are platform-managed rather than
 * tied to a specific operator in the current schema.
 */
export { OperatorRepository } from "./repositories/operator-repository.js";
export { OperatorService } from "./services/operator-service.js";
