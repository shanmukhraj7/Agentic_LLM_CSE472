## 1. What It Is

This application is an autonomous multi-agent learning path generator that builds and adapts personalized curricula based on individual career goals and real-time market demand. By pairing learner profiles and extracted resume skills with live job posting trends and course vector search, it drafts structured, constraint-validated study roadmaps. As learners progress or industry demands fluctuate, continuous feedback loops dynamically re-plan courses and surface transparent version diffs.

## 2. Architecture

```text
  +-------------------------------------------------------------+
  |              Learner Profile + Uploaded Resume              |
  +-------------------------------------------------------------+
                                 |
                                 v
                     +-----------------------+
                     |     Profiler Agent    |
                     +-----------------------+
                                 |
                                 v
                     +-----------------------+      +-------------------------------+
                     |     Market Analyst    | <--- | Job-Posting Embeddings &      |
                     |         Agent         |      | Real-Time Skill Demand Trends |
                     +-----------------------+      +-------------------------------+
                                 |
                       (Ranked Skill Gaps)
                                 v
+----------------->  +-----------------------+
|                    |     Planner Agent     | <====> [ Tool Loop over Course RAG ]
|                    +-----------------------+
|                                |
|                        (Candidate Plan)
|                                v
|                    +-----------------------+
|                    |     Critic Agent      |
|                    |-----------------------|
|                    | Deterministic Checks  |  (Prereqs, time caps, duplicates, gaps)
|                    |          v            |
|                    |       LLM Judge       |  (Pacing, feasibility & rationale)
|                    +-----------------------+
|                                |
|   Fails Checks / Rejection     | Passes Checks
|   (Max 2 retries with feedback)|
+--------------------------------+
                                 |
                                 v
                     +-----------------------+
                     |      Saved Plan       |  (Active Roadmap v1)
                     +-----------------------+
                                 |
                                 v
                     +-----------------------+      Triggers:
                     |    Feedback Agent     | <--- - Learner Progress (scores, completions)
                     +-----------------------+      - Market Shift (demand delta >= 10)
                                 |                  - Daily Cron (/api/cron/replan)
                                 v
                     +-----------------------+
                     |   New Plan Version    |  (v2 Roadmap with Visual Diff)
                     +-----------------------+
```

## 3. Stack and Free Services Used

- **Framework & Core**: Next.js 16 (App Router, React 19, TypeScript)
- **Styling & UI**: Tailwind CSS v4, shadcn/ui, Lucide Icons, Sonner toasts, and Recharts
- **Database & Vectors**: Supabase PostgreSQL with `pgvector` extension and Row-Level Security (RLS)
- **ORM & Migrations**: Drizzle ORM and Drizzle Kit
- **Agent Orchestration**: Vercel AI SDK (`ai`), `@ai-sdk/groq`, and `@google/genai`
- **Document Ingestion**: `unpdf` (PDF text extraction) and `mammoth` (DOCX parsing)
- **Free Services**:
  - **Supabase (Free Tier)**: Managed PostgreSQL instance, pgvector cosine vector similarity search, and Supabase Auth.
  - **Groq Cloud (Free Tier)**: Fast LLM inference for agent tool calling, structured JSON output generation, and critic judgements.
  - **Google AI Studio (Free Tier)**: Generates 768-dimensional text embeddings via `gemini-embedding-001`.
  - **Remotive API (Free Public API)**: Remote tech job listings feed used for market demand analysis.
  - **Vercel (Hobby Tier)**: Edge-ready web hosting and scheduled daily cron execution via `vercel.json`.

## 4. Setup

1. **Clone and Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Copy `.env.example` to create `.env.local` and configure the following variables:
   ```bash
   cp .env.example .env.local
   ```
   - `GROQ_API_KEY`: API key from Groq Console for LLM inference.
   - `GEMINI_API_KEY`: API key from Google AI Studio for vector embeddings.
   - `DATABASE_URL`: Supabase Postgres connection string (pooling or direct).
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key for administrative schema operations.
   - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon public API key.
   - `CRON_SECRET`: Secret bearer token protecting the daily cron re-plan endpoint.
   - `REMOTIVE_API_URL`: Job listings API URL (`https://remotive.com/api/remote-jobs`).

3. **Push Database Schema**
   ```bash
   npm run db:push
   ```

4. **Apply Row-Level Security (RLS)**
   Execute the SQL statements located in `drizzle/rls.sql` in the Supabase SQL Editor to enable table security policies.

5. **Seed Initial Data and Generate Vector Embeddings**
   ```bash
   npm run seed
   ```

6. **Start the Development Server**
   ```bash
   npm run dev
   ```

## 5. Agents

**Profiler Agent**: Ingests user input goals and uploaded resumes (`.pdf` or `.docx`), extracting the learner's existing skills, estimated proficiency levels, target job role, and available weekly study hours. It standardizes all extracted skills against a controlled vocabulary list and isolates resume text in untrusted tags to mitigate prompt injection risks.

**Market Analyst Agent**: Analyzes the gap between the learner's current capabilities and current industry requirements by cross-referencing job posting vector embeddings with aggregated skill demand trends. It identifies missing prerequisite and core competencies, computing a weighted importance score to prioritize top actionable skill gaps.

**Planner Agent**: Runs an autonomous tool loop over course vector search (RAG) to assemble an end-to-end curriculum roadmap targeted at closing the learner's highest-priority skill gaps. It resolves prerequisite relationships, selects appropriately leveled courses, balances study durations against weekly time budgets, and provides explicit rationales for each selected module.

**Critic Agent**: Operates as a dual-stage quality evaluation gate that first executes deterministic validation checks—verifying prerequisite sequences, duplicate enrollments, weekly hour caps, and target gap coverage—followed by an LLM judge evaluating pedagogical pacing and realistic completion expectations. When violations or weaknesses are found, it rejects the draft and passes actionable feedback back to the Planner Agent for up to two retry attempts.

**Feedback Agent**: Observes learner events (completed courses, low quiz scores, difficulty ratings), market demand shifts (trend deltas $\ge 10$), and daily scheduled cron triggers to determine if an existing plan is obsolete or failing the learner. When triggered, it initiates a re-planning workflow and generates an updated plan version accompanied by an auditable, visually distinct diff.

## 6. A 2-Minute Demo Script

1. **Sign Up**: Navigate to `/login` and create a new account using your email and password via Supabase Auth.
2. **Upload Resume**: Go to `/onboarding`, enter your target career aspiration, set your weekly hour budget (e.g., 10 hrs/week), and upload your resume (`.pdf` or `.docx`).
3. **Confirm Profile**: Inspect the parsed profile generated by the Profiler Agent, confirming or editing your target role, detected skills, and baseline proficiency levels.
4. **Watch Generation Stages**: Click "Generate Plan" and follow the live status indicators (`analyzing_gaps` $\rightarrow$ `drafting_plan` $\rightarrow$ `retrieving_courses` $\rightarrow$ `validating`) as the Critic validates the roadmap through deterministic checks and the LLM judge.
5. **Mark Two Modules Complete**: On the generated plan dashboard (`/dashboard`), check off the first two course modules as completed.
6. **Submit One Low Quiz Score**: On the third module, submit a quiz score below 60% (e.g., 45%) to record a comprehension struggle event.
7. **See the Re-Plan Toast**: Observe the instant notification toast and dashboard banner indicating that the Feedback Agent detected struggling performance and recommends updating your plan.
8. **Open History for the v1 $\rightarrow$ v2 Diff**: Navigate to `/dashboard/history` to review the version timeline and inspect the visual diff between v1 and v2, highlighting newly inserted prerequisite courses and rescheduled modules.
9. **Click Simulate Market Shift**: Return to the dashboard and click the "Simulate Market Shift" button to inject sudden demand score deltas into key market skills.
10. **Show the Cron Endpoint**: Trigger the protected daily cron endpoint (`curl -X GET http://localhost:3000/api/cron/replan -H "Authorization: Bearer <CRON_SECRET>"`) to demonstrate background evaluation and automated multi-learner re-planning.

## 7. Known Limitations

- **Synthetic Catalogue and Jobs**: The course library and benchmark job postings use curated synthetic datasets mapped to a predefined skill vocabulary to ensure deterministic evaluation and reliable RAG retrieval rather than unbounded web scraping.
- **Vercel Daily Cron Granularity**: Vercel Hobby tier restricts cron jobs to once-daily frequency (`0 3 * * *`), so immediate re-evaluations during active testing rely on real-time event triggers or manual trigger buttons rather than continuous cron polling.
- **No OCR for Scanned Resumes**: Resume parsing is performed via text extraction streams (`unpdf` and `mammoth`) designed for digital PDFs and DOCX files; rasterized scanned images or photographed PDFs lacking embedded digital text layers are not supported.
- **Shared Market Data in the Demo**: Skill demand metrics and simulated market shifts update globally shared database tables rather than tenant-isolated market states, meaning simulated market shifts affect all demo accounts evaluating those target roles simultaneously.
