import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getLearner } from "@/lib/learners";
import { Profile } from "@/lib/contracts";
import { handleRoute, jsonError } from "@/lib/http";
import { createPlan, type StatusStage } from "@/lib/agents/orchestrate";
import { savePlan } from "@/lib/services/plans";
import { db } from "@/lib/db/client";
import { learners } from "@/lib/db/schema";

// Per Next.js 16 docs (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md):
// Route segment config "runtime" is not compatible with nextConfig.cacheComponents and causes compile failure.
// Cache Components defaults to nodejs runtime.
// export const runtime = "nodejs";
export const maxDuration = 60;

function sanitizeErrorMessage(err: unknown): string {
  let message = "Failed to generate plan";

  if (err instanceof Error) {
    message = err.message || "Failed to generate plan";
  } else if (typeof err === "string") {
    message = err;
  } else if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    message = (err as { message: string }).message;
  }

  // Use only the first line to prevent multi-line stack trace leaks
  const firstLine = message.split("\n")[0]?.trim() || "Failed to generate plan";
  message = firstLine;

  // Strip file paths with line/column numbers
  message = message.replace(/(?:\/[a-zA-Z0-9_.-]+)+:\d+(?::\d+)?/g, "");

  // Strip full directory paths
  message = message.replace(/(?:\/[a-zA-Z0-9_.-]+){2,}/g, "");

  // Mask database / URL credentials
  message = message.replace(/([a-zA-Z]+:\/\/[^:]+):[^@]+@/g, "$1:[REDACTED]@");

  // Mask known API keys, tokens, or JWTs
  message = message.replace(/gsk_[a-zA-Z0-9_-]+/gi, "[REDACTED]");
  message = message.replace(/sb_[a-zA-Z0-9_-]+/gi, "[REDACTED]");
  message = message.replace(
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g,
    "[REDACTED]"
  );
  message = message.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]");

  return message.trim() || "Failed to generate plan";
}

export async function POST() {
  return handleRoute(async () => {
    const user = await requireUser();

    const learner = await getLearner(user.id);
    if (!learner || !learner.profileJson) {
      return jsonError(400, "PROFILE_MISSING", "Complete onboarding first");
    }

    const parsedProfile = Profile.safeParse(learner.profileJson);
    if (!parsedProfile.success) {
      return jsonError(400, "PROFILE_MISSING", "Complete onboarding first");
    }

    const profile = parsedProfile.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        } catch {
          closed = true;
        }
      };

      try {
        const { plan, criticReport } = await createPlan(
          {
            learnerId: user.id,
            profile,
            completedCourseIds: [],
          },
          (stage: StatusStage) => {
            send({ type: "status", stage });
          }
        );

        const saved = await savePlan({
          learnerId: user.id,
          plan,
          criticReport,
        });

        await db
          .update(learners)
          .set({
            lastReplanAt: new Date(),
          })
          .where(eq(learners.id, user.id));

        send({
          type: "result",
          planId: saved.id,
          version: saved.version,
          passed: criticReport.passed,
        });
      } catch (err: unknown) {
        send({
          type: "error",
          message: sanitizeErrorMessage(err),
        });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      }
    },
  });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
