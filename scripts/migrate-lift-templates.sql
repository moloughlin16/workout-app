-- ============================================================
-- Lift template migration — 3-day + 2-day splits
-- ============================================================
-- Run this ONCE in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/njyhpgxyvcxbnnqqjufj/sql
--
-- It does two things:
--   1. Lets lift_sessions.template_name accept the new day names.
--   2. Carries existing lift history forward to the new exercise names,
--      so your "last time" hints and progress charts don't reset.
--
-- Safe to run more than once (the UPDATEs just match nothing the 2nd time).
-- ============================================================

-- 1) Allow the new template (day) names. We keep the old names in the list
--    so existing rows still satisfy the constraint.
ALTER TABLE lift_sessions
  DROP CONSTRAINT IF EXISTS lift_sessions_template_name_check;

ALTER TABLE lift_sessions
  ADD CONSTRAINT lift_sessions_template_name_check
  CHECK (template_name IN (
    'Day A', 'Day B', 'Day C',      -- 3-day split
    'Day 1', 'Day 2',               -- 2-day split
    'Full Body 1', 'Full Body 2',   -- legacy (kept so old rows validate)
    'Custom'
  ));

-- 2) History remap: same movement, cleaner name. Each line moves all logged
--    sets from the old name to the new one so the history follows.
UPDATE lift_sets SET exercise_name = 'Back Squat'             WHERE exercise_name = 'Squat (or Trap Bar DL)';
UPDATE lift_sets SET exercise_name = 'Romanian Deadlift'      WHERE exercise_name = 'RDL (or SLDL)';
UPDATE lift_sets SET exercise_name = 'Standing Overhead Press' WHERE exercise_name = 'Overhead Press';
UPDATE lift_sets SET exercise_name = 'Hamstring Curl'         WHERE exercise_name = 'Hamstring Curls';
UPDATE lift_sets SET exercise_name = 'Hip Abduction'          WHERE exercise_name = 'Hip Abduction (optional)';
UPDATE lift_sets SET exercise_name = 'Face Pulls'            WHERE exercise_name = 'Face Pulls / Rear Delts';

-- Note: exact-name matches (Box Jumps, Kettlebell Swings, Bulgarian Split
-- Squat, Lateral Raises) need no remap — they already match. The old
-- "Bench Press" and "Assisted Pull-ups" histories are reachable as the
-- "Bench Press" / "Assisted Pull-ups" swap options on the new days.
