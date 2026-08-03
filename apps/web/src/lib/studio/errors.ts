/**
 * Structured failures.
 *
 * Agents loop forever on ambiguous errors, so every failure carries a code the
 * caller can branch on and an explicit `retryable` flag. A bad argument must
 * never look like a transient outage.
 */
export type StudioErrorCode =
  | "bad_request"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "cap_reached"
  | "provider_error"
  | "internal";

export class StudioError extends Error {
  readonly code: StudioErrorCode;
  readonly retryable: boolean;

  constructor(code: StudioErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "StudioError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Anything thrown deeper than us becomes a non-retryable internal error. */
export function asStudioError(err: unknown): StudioError {
  if (err instanceof StudioError) return err;
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return new StudioError("internal", message);
}
