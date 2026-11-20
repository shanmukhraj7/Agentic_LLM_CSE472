import { extractText } from "unpdf";
import mammoth from "mammoth";

export class EmptyResumeError extends Error {
  constructor(message: string = "Resume text is too short or empty (minimum 200 characters required)") {
    super(message);
    this.name = "EmptyResumeError";
    Object.setPrototypeOf(this, EmptyResumeError.prototype);
  }
}

export async function extractResumeText(
  buffer: Buffer,
  kind: "pdf" | "docx"
): Promise<string> {
  let rawText = "";

  if (kind === "pdf") {
    const { text } = await extractText(buffer, { mergePages: true });
    rawText = Array.isArray(text) ? text.join("\n") : (text ?? "");
  } else if (kind === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    rawText = result.value ?? "";
  }

  const cleaned = rawText.replace(/\s+/g, " ").trim();
  const capped = cleaned.slice(0, 12000);

  if (capped.length < 200) {
    throw new EmptyResumeError();
  }

  return capped;
}
