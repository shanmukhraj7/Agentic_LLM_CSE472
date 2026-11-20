import type { LanguageModel } from "ai";
import { groq } from "@/lib/llm/groq";
import { FAST_MODEL, PLANNER_MODEL } from "@/lib/llm/models";
import {
  extractHttpStatus,
  getRetryAfterHeaderMs,
  getTryAgainDelayMs,
  isNetworkError,
  withRetry,
} from "@/lib/retry";

export class LlmError extends Error {
  constructor(
    message: string = "The AI service is busy. Please try again in a minute.",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "LlmError";
  }
}

export function isJsonValidateFailed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const status = extractHttpStatus(err);
  if (status !== 400) return false;

  const error = err as Record<string, unknown>;

  if (error.code === "json_validate_failed") return true;

  if (
    error.error &&
    typeof error.error === "object" &&
    (error.error as Record<string, unknown>).code === "json_validate_failed"
  ) {
    return true;
  }

  if (error.data && typeof error.data === "object") {
    const data = error.data as Record<string, unknown>;
    if (data.code === "json_validate_failed") return true;
    if (
      data.error &&
      typeof data.error === "object" &&
      (data.error as Record<string, unknown>).code === "json_validate_failed"
    ) {
      return true;
    }
  }

  if (error.response && typeof error.response === "object") {
    const res = error.response as Record<string, unknown>;
    if (res.data && typeof res.data === "object") {
      const data = res.data as Record<string, unknown>;
      if (data.code === "json_validate_failed") return true;
      if (
        data.error &&
        typeof data.error === "object" &&
        (data.error as Record<string, unknown>).code === "json_validate_failed"
      ) {
        return true;
      }
    }
  }

  if (typeof error.responseBody === "string" && error.responseBody.includes('"json_validate_failed"')) {
    return true;
  }

  if (typeof error.message === "string" && error.message.includes("json_validate_failed")) {
    return true;
  }

  if (error.cause && error.cause !== err && typeof error.cause === "object") {
    return isJsonValidateFailed(error.cause);
  }

  return false;
}

export function isTimeoutError(err: unknown): boolean {
  if (!err) return false;

  if (typeof err === "object") {
    const error = err as Record<string, unknown>;
    if (error.name === "TimeoutError") return true;
    if (error.code === "ETIMEDOUT") return true;
    if (
      typeof error.message === "string" &&
      (error.message.toLowerCase().includes("timeout") ||
        error.message.toLowerCase().includes("timed out") ||
        error.message.toLowerCase().includes("und_err_connect_timeout") ||
        error.message.toLowerCase().includes("err_socket_connection_timeout"))
    ) {
      return true;
    }
    if (error.cause && error.cause !== err && typeof error.cause === "object") {
      return isTimeoutError(error.cause);
    }
  }

  return false;
}

export function isRetryableLlmError(err: unknown, timedOut?: boolean): boolean {
  if (isJsonValidateFailed(err)) return true;

  const status = extractHttpStatus(err);
  if (status === 429) return true;
  if (status !== undefined && status >= 500 && status <= 599) return true;
  if (timedOut || isTimeoutError(err)) return true;
  if (isNetworkError(err)) return true;

  return false;
}

export function compute429Delay(err: unknown): number {
  const retryAfterHeader = getRetryAfterHeaderMs(err);
  const tryAgain = getTryAgainDelayMs(err);
  const longest = Math.max(retryAfterHeader ?? 0, tryAgain ?? 0, 2000);
  const jitter = Math.random() * 800;
  return Math.min(20_000, longest + jitter);
}

export async function runWithFallback<T>(
  run: (model: LanguageModel, signal: AbortSignal) => Promise<T>,
  opts?: { primary?: string }
): Promise<T> {
  const primaryModelId = opts?.primary ?? PLANNER_MODEL;
  const primaryModel = groq(primaryModelId);

  let jsonValidateRetries = 0;
  let primaryTimedOut = false;

  try {
    return await withRetry(
      async () => {
        const signal = AbortSignal.timeout(40_000);
        try {
          return await run(primaryModel, signal);
        } catch (err: unknown) {
          if (signal.aborted) {
            primaryTimedOut = true;
          }
          throw err;
        }
      },
      {
        retries: 4,
        shouldRetry: (err) => {
          if (isJsonValidateFailed(err)) {
            if (jsonValidateRetries < 2) {
              jsonValidateRetries++;
              return true;
            }
            return false;
          }

          const status = extractHttpStatus(err);
          if (status === 429) return true;
          if (status !== undefined && status >= 500 && status <= 599) return true;
          if (primaryTimedOut || isTimeoutError(err)) return true;
          if (isNetworkError(err)) return true;

          return false;
        },
        delayMs: (err, attempt) => {
          const status = extractHttpStatus(err);
          if (status === 429) {
            return compute429Delay(err);
          }
          const backoff = 800 * Math.pow(2, attempt);
          const jitter = Math.random() * 800;
          return backoff + jitter;
        },
      }
    );
  } catch (primaryErr: unknown) {
    if (!isRetryableLlmError(primaryErr, primaryTimedOut)) {
      throw primaryErr;
    }

    if (primaryModelId === FAST_MODEL) {
      throw new LlmError("The AI service is busy. Please try again in a minute.", {
        cause: primaryErr,
      });
    }

    const fallbackSignal = AbortSignal.timeout(40_000);
    try {
      return await run(groq(FAST_MODEL), fallbackSignal);
    } catch (fallbackErr: unknown) {
      if (isRetryableLlmError(fallbackErr, fallbackSignal.aborted)) {
        throw new LlmError("The AI service is busy. Please try again in a minute.", {
          cause: fallbackErr,
        });
      }

      throw fallbackErr;
    }
  }
}
