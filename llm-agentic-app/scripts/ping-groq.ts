import { generateObject } from "ai";
import { z } from "zod";
import { groq } from "@/lib/llm/groq";
import { FAST_MODEL } from "@/lib/llm/models";

async function main() {
  const { object } = await generateObject({
    model: groq(FAST_MODEL),
    schema: z.object({
      ok: z.boolean(),
    }),
    prompt: "Return JSON with ok set to true.",
  });

  console.log(object);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
