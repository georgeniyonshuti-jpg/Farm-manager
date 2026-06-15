export class InboundValidationError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, missingFields?: string[], invalidFkFields?: string[] }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = "InboundValidationError";
    this.code = opts.code || "VALIDATION_ERROR";
    this.missingFields = opts.missingFields || [];
    this.invalidFkFields = opts.invalidFkFields || [];
  }
}

/**
 * @param {unknown} err
 */
export function isInboundValidationError(err) {
  return err instanceof InboundValidationError;
}

/**
 * @param {unknown} err
 */
export function sanitizePostgresInboundError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const colMatch = msg.match(/column "([^"]+)" of relation/);
  if (colMatch) {
    return new InboundValidationError(`Unknown or disallowed field for this entity: ${colMatch[1]}`, {
      code: "INVALID_COLUMN",
    });
  }
  const uuidMatch = msg.match(/invalid input syntax for type uuid/i);
  if (uuidMatch) {
    return new InboundValidationError("Invalid UUID in foreign key field", { code: "INVALID_FK" });
  }
  return new InboundValidationError(msg.slice(0, 500), { code: "DATABASE_ERROR" });
}
