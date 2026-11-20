export class RateLimitError extends Error {
  readonly code = "COOLDOWN";

  constructor(
    message: string = "Please wait a few seconds before re-planning again.",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export function isRateLimitError(err: unknown): err is RateLimitError {
  return (
    err instanceof RateLimitError ||
    (typeof err === "object" &&
      err !== null &&
      (("name" in err && (err as { name: unknown }).name === "RateLimitError") ||
        ("code" in err && (err as { code: unknown }).code === "COOLDOWN") ||
        ("constructor" in err &&
          (err.constructor as { name?: string })?.name === "RateLimitError")))
  );
}
