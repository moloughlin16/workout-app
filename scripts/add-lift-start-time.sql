-- ============================================================
-- Add start_time to lift_sessions
-- ============================================================
-- Run this ONCE in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/njyhpgxyvcxbnnqqjufj/sql
--
-- Lets the Planner remember which slot (morning / afternoon / evening) a
-- lift was added to. Nullable: lifts logged from the Lift tab leave it NULL
-- and the Planner falls back to showing them under Morning.
-- ============================================================

ALTER TABLE lift_sessions
  ADD COLUMN IF NOT EXISTS start_time time;
