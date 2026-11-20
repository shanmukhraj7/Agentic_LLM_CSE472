-- The app connects with a privileged Postgres role that bypasses RLS, so RLS
-- protects direct Supabase client access and is defence in depth; app routes
-- still filter by learner id.

-- Enable Row Level Security
ALTER TABLE learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE replan_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_trends ENABLE ROW LEVEL SECURITY;

-- learners: for authenticated, SELECT/INSERT/UPDATE/DELETE where id = (select auth.uid())
DROP POLICY IF EXISTS learners_select ON learners;
CREATE POLICY learners_select ON learners
  FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS learners_insert ON learners;
CREATE POLICY learners_insert ON learners
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS learners_update ON learners;
CREATE POLICY learners_update ON learners
  FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS learners_delete ON learners;
CREATE POLICY learners_delete ON learners
  FOR DELETE
  TO authenticated
  USING (id = (select auth.uid()));

-- plans: for authenticated, all four operations where learner_id = (select auth.uid())
DROP POLICY IF EXISTS plans_select ON plans;
CREATE POLICY plans_select ON plans
  FOR SELECT
  TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS plans_insert ON plans;
CREATE POLICY plans_insert ON plans
  FOR INSERT
  TO authenticated
  WITH CHECK (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS plans_update ON plans;
CREATE POLICY plans_update ON plans
  FOR UPDATE
  TO authenticated
  USING (learner_id = (select auth.uid()))
  WITH CHECK (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS plans_delete ON plans;
CREATE POLICY plans_delete ON plans
  FOR DELETE
  TO authenticated
  USING (learner_id = (select auth.uid()));

-- progress_events: for authenticated, all four operations where learner_id = (select auth.uid())
DROP POLICY IF EXISTS progress_events_select ON progress_events;
CREATE POLICY progress_events_select ON progress_events
  FOR SELECT
  TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS progress_events_insert ON progress_events;
CREATE POLICY progress_events_insert ON progress_events
  FOR INSERT
  TO authenticated
  WITH CHECK (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS progress_events_update ON progress_events;
CREATE POLICY progress_events_update ON progress_events
  FOR UPDATE
  TO authenticated
  USING (learner_id = (select auth.uid()))
  WITH CHECK (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS progress_events_delete ON progress_events;
CREATE POLICY progress_events_delete ON progress_events
  FOR DELETE
  TO authenticated
  USING (learner_id = (select auth.uid()));

-- replan_log: for authenticated, all four operations where learner_id = (select auth.uid())
DROP POLICY IF EXISTS replan_log_select ON replan_log;
CREATE POLICY replan_log_select ON replan_log
  FOR SELECT
  TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS replan_log_insert ON replan_log;
CREATE POLICY replan_log_insert ON replan_log
  FOR INSERT
  TO authenticated
  WITH CHECK (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS replan_log_update ON replan_log;
CREATE POLICY replan_log_update ON replan_log
  FOR UPDATE
  TO authenticated
  USING (learner_id = (select auth.uid()))
  WITH CHECK (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS replan_log_delete ON replan_log;
CREATE POLICY replan_log_delete ON replan_log
  FOR DELETE
  TO authenticated
  USING (learner_id = (select auth.uid()));

-- courses: for authenticated, SELECT only using (true). No write policies.
DROP POLICY IF EXISTS courses_select ON courses;
CREATE POLICY courses_select ON courses
  FOR SELECT
  TO authenticated
  USING (true);

-- job_postings: for authenticated, SELECT only using (true). No write policies.
DROP POLICY IF EXISTS job_postings_select ON job_postings;
CREATE POLICY job_postings_select ON job_postings
  FOR SELECT
  TO authenticated
  USING (true);

-- skill_trends: for authenticated, SELECT only using (true). No write policies.
DROP POLICY IF EXISTS skill_trends_select ON skill_trends;
CREATE POLICY skill_trends_select ON skill_trends
  FOR SELECT
  TO authenticated
  USING (true);
