import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import type { LlmError } from "@/lib/llm/call";
import { RateLimitError } from "@/lib/errors";

function isLlmError(err: unknown): err is LlmError {
  return (
    err instanceof Error &&
    (err.name === "LlmError" || err.constructor.name === "LlmError")
  );
}

function isRateLimitError(err: unknown): err is RateLimitError {
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

export function jsonError(
  status: number,
  code: string,
  message: string
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status }
  );
}

export async function parseJson<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ZodError([
      {
        code: "custom",
        path: [],
        message: "Invalid JSON",
      },
    ]);
  }
  return schema.parse(body);
}

export async function handleRoute(
  fn: () => Promise<Response>
): Promise<Response> {
  try {
    return await fn();
  } catch (err: unknown) {
    if (
      (typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: unknown }).status === 401) ||
      err === 401
    ) {
      const message =
        typeof err === "object" &&
        "message" in err &&
        typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Unauthorized";
      return jsonError(401, "UNAUTHORIZED", message);
    }

    if (
      err instanceof ZodError ||
      (err instanceof Error && err.name === "ZodError")
    ) {
      const message =
        (err as ZodError).issues?.[0]?.message ||
        (err as Error).message ||
        "Bad Request";
      return jsonError(400, "BAD_REQUEST", message);
    }

    if (isRateLimitError(err)) {
      const message =
        (typeof err === "object" &&
          err !== null &&
          "message" in err &&
          typeof (err as { message: unknown }).message === "string" &&
          (err as { message: string }).message) ||
        "Please wait a few seconds before re-planning again.";
      return jsonError(429, "COOLDOWN", message);
    }

    if (isLlmError(err)) {
      const message =
        err.message ||
        "The AI service is busy. Please try again in a minute.";
      return jsonError(503, "AI_BUSY", message);
    }

    console.error(err);
    return jsonError(
      500,
      "INTERNAL",
      err instanceof Error ? err.message : "Something went wrong"
    );
  }
}
