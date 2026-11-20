import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleRoute, jsonError } from "@/lib/http";
import { extractResumeText, EmptyResumeError } from "@/lib/resume/extract";
import { buildProfile } from "@/lib/agents/profiler";
import { MAX_OUTPUT_TOKENS } from "@/lib/llm/limits";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

const PDF_MIME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
]);

const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/docx",
  "application/x-docx",
]);

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    await requireUser();

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return jsonError(400, "BAD_REQUEST", "Invalid multipart form data");
    }

    const rawGoalText = formData.get("goalText");
    if (typeof rawGoalText !== "string") {
      return jsonError(400, "BAD_REQUEST", "goalText is required");
    }
    const goalText = rawGoalText.trim();
    if (goalText.length < 10 || rawGoalText.length > 2000 || goalText.length > 2000) {
      return jsonError(
        400,
        "BAD_REQUEST",
        "goalText must be between 10 and 2000 characters"
      );
    }

    const rawHours = formData.get("hoursPerWeek");
    if (typeof rawHours !== "string" || !/^\d+$/.test(rawHours.trim())) {
      return jsonError(
        400,
        "BAD_REQUEST",
        "hoursPerWeek must be an integer between 1 and 60"
      );
    }
    const hoursPerWeek = parseInt(rawHours.trim(), 10);
    if (hoursPerWeek < 1 || hoursPerWeek > 60) {
      return jsonError(
        400,
        "BAD_REQUEST",
        "hoursPerWeek must be between 1 and 60"
      );
    }

    const fileEntry = formData.get("file");
    let isFilePresent = false;
    let file: File | null = null;

    if (fileEntry !== null && fileEntry !== undefined) {
      if (typeof fileEntry === "string") {
        if (fileEntry.trim().length > 0) {
          return jsonError(400, "BAD_REQUEST", "Invalid file");
        }
      } else if (fileEntry instanceof File) {
        if (fileEntry.name.trim().length > 0 || fileEntry.size > 0) {
          isFilePresent = true;
          file = fileEntry;
        }
      } else {
        return jsonError(400, "BAD_REQUEST", "Invalid file");
      }
    }

    let resumeText: string | undefined;

    if (isFilePresent && file) {
      if (file.size > MAX_FILE_SIZE) {
        return jsonError(
          400,
          "BAD_REQUEST",
          "File size exceeds 4 MB limit"
        );
      }

      const fileName = file.name.toLowerCase();
      const mimeType = (file.type || "").split(";")[0].trim().toLowerCase();

      let kind: "pdf" | "docx";
      if (fileName.endsWith(".pdf") && PDF_MIME_TYPES.has(mimeType)) {
        kind = "pdf";
      } else if (fileName.endsWith(".docx") && DOCX_MIME_TYPES.has(mimeType)) {
        kind = "docx";
      } else {
        return jsonError(
          400,
          "BAD_REQUEST",
          "Only .pdf and .docx files are accepted"
        );
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        resumeText = await extractResumeText(buffer, kind);
      } catch (err: unknown) {
        if (err instanceof EmptyResumeError) {
          return jsonError(
            422,
            "RESUME_EMPTY",
            "No readable text found. Paste your background into the goal box instead."
          );
        }
        return jsonError(400, "BAD_REQUEST", "Failed to read resume file");
      }
    }

    if (MAX_OUTPUT_TOKENS.profiler < 2500) {
      (MAX_OUTPUT_TOKENS as unknown as { profiler: number }).profiler = 2500;
    }

    const profile = await buildProfile({
      goalText,
      hoursPerWeek,
      resumeText,
    });

    return NextResponse.json({ profile }, { status: 200 });
  });
}
