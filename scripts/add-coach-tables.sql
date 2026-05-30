-- ============================================================
-- Coach feature tables
-- ============================================================
-- Run ONCE in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/njyhpgxyvcxbnnqqjufj/sql
--
-- Adds:
--   1. training_profile — a single editable row the AI coach always reads
--      (goals / current focus / constraints / availability).
--   2. coach_plans — caches the weekly AI "game plan" (keyed by the
--      upcoming week's Monday), mirroring weekly_summaries.
-- ============================================================

-- 1) Editable coaching profile (single row).
CREATE TABLE IF NOT EXISTS training_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goals text,
  current_focus text,
  constraints text,
  available_days text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE training_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all for anon" ON training_profile;
CREATE POLICY "allow all for anon" ON training_profile
  FOR ALL USING (true) WITH CHECK (true);

-- 2) Cached weekly game plans.
CREATE TABLE IF NOT EXISTS coach_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date UNIQUE NOT NULL,   -- the upcoming week's Monday (cache key)
  plan text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE coach_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all for anon" ON coach_plans;
CREATE POLICY "allow all for anon" ON coach_plans
  FOR ALL USING (true) WITH CHECK (true);
