PROJECT: AI Learning Path Generator. Next.js (App Router) + TypeScript strict. Everything is TypeScript.

FIXED STACK (do not substitute): Next.js, Tailwind, shadcn/ui, Recharts, Drizzle ORM, Supabase (Postgres + pgvector, Auth), Vercel AI SDK with @ai-sdk/groq for ALL LLM calls, Gemini embeddings ONLY for embeddings, Zod, Vitest.

HARD RULES
1. LLM = Groq only. Embeddings = Gemini only. No other providers.
2. Every LLM output is validated by a Zod schema from src/lib/contracts.ts. Never parse JSON by hand.
3. Never invent course IDs. Course IDs come only from the database.
4. Never read learner_id from a request body. Always take it from the Supabase session.
5. SUPABASE_SERVICE_ROLE_KEY is server-only. Never import it in client code or in any file with "use client".
6. Environment variables are read only through src/lib/env.ts.
7. Model names live only in src/lib/llm/models.ts.
8. No new dependency unless the prompt lists it.

SCOPE DISCIPLINE
Each prompt lists FILES. Create or edit only those. Do not add features, tests, docs, comments, refactors or styling beyond the prompt. If something outside FILES needs a change, STOP and tell me; do not make it.

AFTER EVERY PROMPT
Run `npx tsc --noEmit` and fix errors in the listed files only. Then reply in 3 lines: files changed, what works, what is not done.