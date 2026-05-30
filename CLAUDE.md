# Workout App — Project Context for Claude

**Read this file first every session.** It's the living memory of the project.

## What this is

A personal workout + martial arts tracking web app (PWA) for the user. Completely free tech stack, built solo while learning.

## User context

- New to JavaScript / TypeScript / React — wants concepts explained as we build
- Trains martial arts: MMA, Kickboxing, BJJ/Grappling, Sparring (1-hour classes)
- Goal: 10 hours/week of martial arts (2-3 MMA, 2-4 kickboxing, 2-4 grappling, 1 sparring)
- Lifts twice a week (Full Body 1 Strength, Full Body 2 Power — templates below)
- Has Apple Watch, no privacy concerns
- Mac (Apple Silicon? check with `uname -m` if needed) — Node installed via .pkg at `/usr/local/bin/node`

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Supabase** (Postgres) — set up, project `njyhpgxyvcxbnnqqjufj`, anon key in `.env.local`
- **GitHub** — `https://github.com/moloughlin16/workout-app` (push works without PAT, creds cached in macOS Keychain)
- **Vercel** — deployed at **https://workout-app-seven-vert.vercel.app/** (auto-deploys on push to `main`). Env vars `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in the Vercel dashboard.
- **Claude API** for AI features — integrated (weekly summaries). Uses `CLAUDE_API_KEY` in `.env.local` (not `ANTHROPIC_API_KEY` — that name collides with the Claude Code harness's own env var). Model: `claude-sonnet-4-20250514`. SDK: `@anthropic-ai/sdk`.

## Important environment quirks

- `node` is at `/usr/local/bin/node` but NOT on the default PATH in Claude Code shells. **Always prepend `export PATH="/usr/local/bin:$PATH"` before running npm/node/npx.**
- The npm cache at `~/.npm/_cacache` has root-owned files that can't be removed without sudo. **Always set `export npm_config_cache="$HOME/.npm-cache-new"`** to work around this. Both env vars together:
  ```
  export PATH="/usr/local/bin:$PATH" && export npm_config_cache="$HOME/.npm-cache-new"
  ```
- **Project lives at `~/dev/workout-app`** (NOT `~/Documents/workout-app` — that location is iCloud Drive synced, which corrupts `node_modules` at random by evicting files to cloud placeholders. Learned the hard way. NEVER put dev projects under `~/Documents`, `~/Desktop`, or any cloud-synced folder on this machine.)
- A stale copy of the project exists at `~/Documents/workout-app` with a locked (iCloud-held) `node_modules` folder. Safe to ignore; the user can delete it manually later once iCloud releases the lock.
- Dev server: `npm run dev` → http://localhost:3000

## Current status

### Completed
- [x] Scaffolded Next.js + TS + Tailwind + App Router + src dir + import alias `@/*`
- [x] `git init` + first commit, GitHub remote wired up
- [x] Supabase project created, `.env.local` populated with URL + anon key
- [x] **Martial arts home page** (`src/app/page.tsx`):
  - Four quick-log buttons (MMA, Kickboxing, Grappling, Sparring)
  - Saves to `martial_arts_sessions`
  - Weekly progress panel: hours + class count + progress bar + per-discipline breakdown toward 10h goal
  - Date picker for **back-dating** classes (amber warning when not today, one-tap reset)
  - "This week's classes" list with **delete** button (optimistic UI + rollback on error)
  - Loading/saving/error UI states
- [x] **Lift tracker** (`src/app/lift/page.tsx`):
  - **Two-program picker**: a 3-Day / 2-Day split toggle at the top, then the days for that program (Day A/B/C or Day 1/2). Each `Template` has a `program: "3-day" | "2-day"` field. Templates are a `TEMPLATES` constant in this file — edit there to add/remove/rename exercises.
  - **Exercise alternatives / swaps** — each `ExerciseDef` has an `alternatives?: string[]`. On the active workout, a "⇄ Swap exercise" control lets you do a substitute when equipment's taken. The swapped name is what gets logged to `lift_sets.exercise_name`, so each variation keeps its own history; swapping re-pulls that exercise's "last time" + pre-fill. Tracked via a `swaps` state map (slot name → chosen) that's also persisted to localStorage.
  - Active workout view: per-exercise cards with inputs for each set (weight × reps)
  - "Last time" hint per exercise via query of most recent `lift_sets` row (shows `BW × N` for bodyweight rows)
  - Add/remove individual sets, **skip an entire exercise** for the current workout via × button (with "Show N skipped" undo)
  - **Backdating** via date picker (same UX as martial arts page)
  - **`unit: "sec"` field** on `ExerciseDef` — when set, the second input shows `sec` instead of `reps` and the history label appends "sec". Currently used for Plank. Stored value is still in the `reps` integer column; only the UI label differs.
  - "Finish Workout" inserts parent `lift_sessions` row then bulk-inserts `lift_sets`
  - **Session notes + mood** — textarea saves to `lift_sessions.notes`; a 5-emoji `MoodPicker` (😩 😕 😐 🙂 💪 → int 1-5) saves to `lift_sessions.mood`. Both live in a card above the "Finish Workout" button on the active workout view, and again at the top of the edit view. Notes preview + mood emoji are shown in the Recent sessions list. Both are fed into the AI weekly summary prompt (mood is translated back to "Drained/Low/Okay/Good/Strong" for Claude).
  - **Workout persistence** — `src/lib/workout-persistence.ts` saves the in-progress workout (template, forms, hidden exercises, mood, notes, logDate) to localStorage on every state change with an 8-hour TTL. Restored on mount of the lift page if any. Cleared on Finish or Cancel.
  - **Pre-fill from last session** — `startTemplate()` queries each exercise's most-recent session and pre-fills every set with that session's values (set #1 → last set #1, etc.). User can adjust with the stepper buttons (± 5 lb for weight, ± 1 for reps) or type directly.
  - **Progress section filter** — only the 6 curated compound lifts (Squat, Bench, OHP, Assisted Pull-ups, RDL/SLDL, Upright Row) appear under "Progress" via the `TRACKED_FOR_PROGRESS` constant. Other exercises still log fine, just don't get a chart entry.
- [x] **Bottom nav** (`src/components/BottomNav.tsx`): fixed nav bar with Martial Arts + Lift tabs, active-tab highlight via `usePathname()`
- [x] **Shared date helpers** (`src/lib/date.ts`): `todayLocal()`, `formatLocalDate()`, `startOfWeekLocal()`, `relativeLabel()` — all use LOCAL time, not UTC, to avoid off-by-one bugs near midnight.
- [x] `src/lib/supabase.ts` shared client
- [x] **Deployed to Vercel** at https://workout-app-seven-vert.vercel.app/ — auto-deploys on push to `main`
- [x] **PWA install** — `public/manifest.json` + 192/512/180px icons (generated by `scripts/make-icons.js`, a zero-dependency Node script using only `zlib` to write valid PNGs). `layout.tsx` exports both `Metadata` (manifest, apple-web-app meta, icons) and `Viewport` (themeColor, viewportFit cover for notch/home-bar). Tested install on iOS Safari → "Add to Home Screen" launches full-screen.
- [x] **Notes + hashtag search** — `/notes` page lists all training notes. URL param `?tag=xxx` filters by tag; a client-side search box filters by free text or `#tag`. Tags rendered via `NoteText` component (`src/components/NoteText.tsx`); parsing helpers in `src/lib/tags.ts` (`extractTags`, `parseNote`).
- [x] **AI weekly summary** — `POST /api/summary` (server route in `src/app/api/summary/route.ts`). Fetches this week's MA sessions + lift sessions + sets from Supabase, sends to Claude Sonnet, returns a coach-style summary (150-250 words). **Cached** in the `weekly_summaries` table keyed by `week_start` (Monday). Client loads cached row on Home-page mount (free, no API call). `?force=true` query param bypasses cache for the "Regenerate" button. UI lives on Home page.
- [x] **Home dashboard** — pure read-only overview at `/`. Weekly MA card, weekly lift card, 8-week bar chart, all-time discipline pie chart (`src/components/DisciplinePieChart.tsx`), AI summary card, recent notes, tags cloud. Logging UI is on `/martial-arts` and `/lift` tabs, not Home.
- [x] **Gym schedule data** — `src/lib/gym-schedule.ts` has the Elevate MMA weekly class schedule transcribed. Exports `GYM_SCHEDULE`, `TRACKABLE_DISCIPLINES`, `DISCIPLINE_COLOR`, `classDurationMin()`.
- [x] **Schedule planner** (`src/app/schedule/page.tsx`): prev/next-week navigation, day-tab row (Mon–Sun with today highlighted and a green dot when classes are planned), per-class cards with "+ Plan" / "✓ Planned · Remove" toggles, and "✓ I went" one-tap logging for today/past trackable classes. "I went" inserts into `martial_arts_sessions` with `class_name` + `start_time` populated, and deletes the matching `planned_sessions` row if it existed. Yoga/Open Mat can be planned but not quick-logged because they'd violate the `martial_arts_sessions.discipline` check constraint.
- [x] **Coach message generator** (`src/lib/coach-message.ts` + button on Home page): reads last week's `martial_arts_sessions` and this week's `planned_sessions`, groups by day, and formats a pastable "Hey coach!" message. Copies to clipboard on generation; shown inline in a read-only textarea so the user can double-check before pasting into Instagram.
- [x] **Bottom nav: 4 tabs** — Home / Planner / Martial Arts / Lift. (Earlier there was a separate /schedule tab; the Elevate schedule view is now embedded inside the Martial Arts page as a sub-tab.)
- [x] **Intensity tracking** — `intensity` column (low/medium/high CHECK constraint) on `martial_arts_sessions` AND `planned_sessions`. UI in `src/components/IntensityPicker.tsx` (3-button selector). Selecting an intensity also tints the whole card with the corresponding light shade (emerald/amber/red) via the `intensityCardClass(value)` helper. When "I went" is tapped on a planned class, its intensity carries forward to the logged martial arts session.
- [x] **Shared `DateRangeFilter` component** (`src/components/DateRangeFilter.tsx`) — chip row of presets (All time / 30d / 90d / 1y / Custom) plus optional start/end date inputs. Used by both `DisciplinePieChart` and `WeeklyMartialArtsChart`.
- [x] **Training history line chart** — `WeeklyMartialArtsChart.tsx` rebuilt as a line + area chart (replacing bar). Has an avg-weekly-hours scorecard, total-hours subhead, and auto-switches to monthly aggregation when the visible range exceeds ~6 months (so the "1y" view shows ~12 points instead of 52).
- [x] **Martial Arts page restructured** — sub-tabs: Sessions / Schedule / Stats / Notes. Big quick-log buttons removed (rarely used in practice); a compact "Log a custom class" form replaces them for off-Elevate training. Schedule tab embeds the Elevate gym schedule. Stats tab holds the history chart + discipline pie. Notes tab holds recent notes, tag cloud, and the Copy-coach-message button.
- [x] **Home page slimmed** — three scorecard rows (MA hours / lifts / cardio min, each with goal progress bar) and the AI summary card. The pie chart, history chart, tags, coach message, recent notes, and "this week's plan" strip all moved out to other pages.
- [x] **Planner page** (`src/app/planner/page.tsx`) — vertical stack of day cards (one per day of the visible week), each split into Morning / Afternoon / Evening sub-sections. Auto-aggregates from 5 sources: logged MA (bucketed by start_time), planned MA, logged lifts (default to Morning per user preference), logged cardio (bucketed by start_time), and `weekly_plans` (custom entries with explicit day_part). Tap "+ Add" in any slot to open an overlay sheet with a Cardio / Custom toggle. Cardio entries save to `cardio_sessions` with start_time pre-filled based on the slot (9am/2pm/6pm). Custom entries save to `weekly_plans`.

### Database schema

**martial_arts_sessions**
- id (uuid pk, default gen_random_uuid)
- date (date, default current_date)
- discipline (text, check: MMA/Kickboxing/Grappling/Sparring)
- duration_min (int, default 60)
- notes (text, nullable)
- class_name (text, nullable) — specific gym class name, populated when logged via Schedule
- start_time (time, nullable) — populated when logged via Schedule
- created_at (timestamptz, default now)
- RLS enabled, policy "allow all for anon"

*Note: `lift_sessions` also has a `mood` column (int 1-5 with a CHECK constraint) populated by the `MoodPicker` component.*

**lift_sessions**
- id (uuid pk)
- date (date, default current_date)
- template_name (text, check: 'Day A' / 'Day B' / 'Day C' / 'Day 1' / 'Day 2' / 'Full Body 1' / 'Full Body 2' / 'Custom' — legacy Full Body names kept so old rows still validate; updated via `scripts/migrate-lift-templates.sql`)
- notes (text, nullable)
- rpe (int 1-10, nullable)
- created_at
- RLS + permissive anon policy

**lift_sets**
- id (uuid pk)
- session_id (uuid fk → lift_sessions.id, ON DELETE CASCADE)
- exercise_name (text)
- set_number (int)
- weight_lb (numeric 6,2, nullable)
- reps (int, nullable)
- rpe (int 1-10, nullable)
- created_at
- indexes: (exercise_name, created_at desc), (session_id)
- RLS + permissive anon policy

**cardio_sessions**
- id (uuid pk)
- date (date, default current_date)
- activity (text) — "Walking" / "Jogging" / "Biking" / freeform
- duration_min (int, check > 0)
- start_time (time, nullable) — pre-filled based on the slot used to add (morning=09:00 / afternoon=14:00 / evening=18:00)
- intensity (text, check low/medium/high, nullable)
- notes (text, nullable)
- RLS + permissive anon policy

**weekly_plans**
- id (uuid pk)
- date (date)
- day_part (text, check morning/afternoon/evening) — explicit, not derived from a time
- title (text) — short description, e.g. "Rest day", "Stretching"
- intensity (text, check low/medium/high, nullable)
- notes (text, nullable)
- RLS + permissive anon policy
- For free-form planning that isn't a real workout or class.

**weekly_summaries**
- id (uuid pk)
- week_start (date, UNIQUE) — Monday's date; acts as the cache key
- summary (text) — Claude's generated summary
- created_at, updated_at (timestamptz)
- RLS + permissive anon policy
- Used for caching AI summaries to avoid repeat Claude API calls

**planned_sessions**
- id (uuid pk)
- date (date) — specific date the class is planned for
- start_time, end_time (time)
- class_name (text) — e.g. "NoGi BJJ Fundamentals"
- discipline (text, check: MMA/Kickboxing/Grappling/Sparring/Other)
- created_at (timestamptz)
- UNIQUE (date, start_time, class_name) — prevents duplicate plans
- RLS + permissive anon policy
- Populated from the Schedule page. When a user taps "I went", the row is deleted and a `martial_arts_sessions` row is inserted in its place.

### Next session plan

The app is deployed, installed on the user's phone, and they're using it for real workouts. The next moves should be **incremental polish driven by what feels missing during actual use** — don't pre-build the roadmap, ask the user what bothered them this week.

In rough priority order if no preference is stated:

1. **Custom class duration** for martial arts. Currently hardcoded to 60 min. Long-press a discipline button (or a "+15" / "−15" stepper after tap) to log a non-standard class.
2. **RPE input on lift sets.** The `lift_sets.rpe` column already exists — just add an optional input next to weight × reps. Many lifters care about this; user may or may not.
3. **Recent lift sessions list** with delete (mirror what martial arts has). Useful when they fat-finger the wrong template.
4. **Per-exercise progress chart**. Read all `lift_sets` for one exercise, plot weight × reps over time. The "is the bar going up?" view. Probably the highest motivation-per-line-of-code feature.
5. **Offline support via service worker.** Gym basements eat WiFi. Right now if Supabase is unreachable, logging fails with no recovery. Add a write-queue in localStorage that flushes on reconnect.
6. **Daily notes / mood / sleep / soreness** — single text+slider input on a new tab.

### Followups / debt (not urgent)
- Auth not set up — permissive RLS policy is fine for personal/private use, but anyone with the URL can write to the DB. If sharing the URL outside personal use, add Supabase email/magic-link auth + per-user RLS.
- Martial arts duration hardcoded to 60.
- No RPE input on lift tracker yet (column exists, just not wired to UI).
- Plank/time-based exercises store seconds in the `reps` integer column. Works fine but is a small abstraction leak. If it ever bites us, add a separate `seconds` column.
- Renaming an exercise in `TEMPLATES` orphans its history (history lookup is keyed by `exercise_name`). Either don't rename, or write a one-line `UPDATE lift_sets SET exercise_name = 'new' WHERE exercise_name = 'old'` SQL when needed.
- No PWA splash screen. iOS shows a white flash on launch. Fixable with `apple-touch-startup-image` for each screen size — tedious, low priority.

### Roadmap after that (do not build yet — order subject to change)

**User's current wishlist (remaining):**
- **Extended AI summaries** — `/api/summary` currently does weekly. Add `?scope=month|all-time|topic` to query past notes. "Ask about your training" UI section with presets like "Summarize my journey" or "What have I learned about guard retention?"
- **Apple Health + Stardust cycle tracking** — neither has a free web API. Only path: iOS Shortcuts on user's phone → webhook route in this app → Supabase table. Not built yet.

**Recently shipped (for context):**
- ✅ Rest timer, schedule planner, coach message generator, AI weekly summaries (cached), pie chart, notes search, lift label rename, Full Body 1 assisted pull-ups + hamstring curls move.
- ❌ Google Calendar sync — user explicitly skipped. If revisited, start with `.ics` file export (no OAuth) before full OAuth sync.

**Other roadmap items:**
- Calendar/heatmap view
- Daily notes + mood/sleep/soreness
- Injury/pain log
- Sparring partner log + technique tags
- Apple Watch → Shortcuts → webhook → Supabase for auto HR/calories/sleep
- Body weight + progress photos
- Goal setting with progress bars

## User's lifting templates (current state in code)

The actual source of truth is the `TEMPLATES` constant in `src/app/lift/page.tsx`. To change exercises, sets, reps, notes, or alternatives, edit that array, commit, and push — Vercel auto-deploys. Each template has a `program` ("3-day"/"2-day"), a short `name` (stored in `template_name`), a `subtitle`, and `exercises` (each with optional `note`, `unit`, and `alternatives`).

The user runs whichever split fits the week — usually the 3-day, falling back to the 2-day on heavier mat weeks. Coach-prescribed, biased toward lats / upper back / side delts (he gets plenty of pressing from striking), with knee/ankle durability work (tib raises, calves, Copenhagen).

### 3-Day Split
**Day A — Lower strength + upper pull/push**
1. Box Jumps — 3×3 · alts: Broad Jumps, Jump Squats
2. Back Squat — 4×4-6 · alts: Front Squat, Safety Bar Squat, Goblet Squat
3. Romanian Deadlift — 3×6-8 · alts: Dumbbell RDL, Barbell Stiff-Leg Deadlift, Single-Leg RDL
4. Dumbbell Bench Press — 4×6-8 · alts: Bench Press, Weighted Push-ups, Machine Chest Press
5. Pull-Ups or Chin-Ups — 4×6-8 · alts: Lat Pulldown, Assisted Pull-ups, Single-Arm Cable Pulldown
6. Hamstring Curl — 3×10-15 · alts: Stability Ball / Nordic regressions / Slider curls
7. Tibialis Raises — 3×15-20 · alts: Tib Bar, Wall raises, Band dorsiflexion

**Day B — Upper body emphasis + athletic lower**
1. Med Ball Rotational Throws — 3×5 ea · alts: Landmine Rotations, Cable Rotational Punches
2. Standing Overhead Press — 4×5-8 · alts: DB Shoulder Press, Landmine Press, Seated DB Press
3. Chest-Supported Row — 4×8-10 · alts: One-Arm DB Row, Seated Cable Row, Barbell Row
4. Bulgarian Split Squat — 3×8 ea · alts: Reverse/Walking/Split Squats
5. Single-Leg RDL — 3×8 ea · alts: B-Stance RDL, Dumbbell RDL, Cable Pull-Through
6. Face Pulls — 3×12-15 · alts: Band Pull-Aparts, Rear Delt Flyes, Reverse Pec Deck
7. Lateral Raises — 3×12-20 · alts: Cable / Machine / Lean-Away
8. Hammer Curls — 3×10-12 · alts: EZ-Bar / DB / Rope Curls
9. Rope Pushdowns — 3×10-12 · alts: Overhead Cable Ext, Skull Crushers, Bench Dips
10. Copenhagen Plank — 2×max **sec** (`unit: "sec"`, per side) · alts: Side Plank, Adductor Machine, Ball Squeeze

**Day C — Full-body power + upper back/shoulders**
1. Kettlebell Swings — 3×12 · alts: DB Swings, Hip Hinge Jumps, Broad Jumps
2. Trap Bar Deadlift — 4×3-5 · alts: Conventional, Sumo, Heavy RDL
3. Incline Dumbbell Press — 3×8-10 · alts: Incline Barbell, Push-ups, Machine
4. Lat Pulldown — 4×8-10 · alts: Pull-Ups, Assisted Pull-ups, Single-Arm Cable
5. Seated Cable Row — 3×10-12 · alts: Chest-Supported Row, One-Arm DB Row, T-Bar Row
6. Hip Abduction — 3×12-15 · alts: Mini-Band Walks, Cable, Side-Lying
7. Farmer Carries — 3 rounds (`targetReps: "rounds"`) · alts: Suitcase / Trap Bar / Heavy DB
8. Standing Calf Raises — 3×12-15 · alts: Seated, Single-Leg, Leg Press
9. Lateral Raises — 2×15-20 · alts: Cable / Machine / Lean-Away

### 2-Day Split (heavy-mat-week fallback)
**Day 1 — Strength emphasis:** Box Jumps 3×3, Back Squat 4×4-6, Romanian Deadlift 3×6-8, Pull-Ups or Chin-Ups 4×6-8, Dumbbell Bench Press 4×6-8, Chest-Supported Row 3×8-10, Hamstring Curl 3×10-15, Lateral Raises 3×12-20, Tibialis Raises 3×15-20.
**Day 2 — Athletic full body:** Med Ball Rotational Throws 3×5 ea, Trap Bar Deadlift 4×3-5, Bulgarian Split Squat 3×8 ea, Standing Overhead Press 4×5-8, Lat Pulldown 4×8-10, Seated Cable Row 3×10-12, Face Pulls 3×12-15, Hip Abduction 3×12-15, Copenhagen Plank 2×max sec, Farmer Carries 3 rounds, Standing Calf Raises 3×12-15, Lateral Raises 2×15-20.
(Same exercise names as the 3-day where they overlap, so they share one history.)

### History migration (when this split shipped)
`scripts/migrate-lift-templates.sql` was run once in Supabase to (a) widen the `template_name` CHECK to the new day names and (b) remap old exercise names to the new ones so history carried over: Squat (or Trap Bar DL)→**Back Squat**, RDL (or SLDL)→**Romanian Deadlift**, Overhead Press→**Standing Overhead Press**, Hamstring Curls→**Hamstring Curl**, Hip Abduction (optional)→**Hip Abduction**, Face Pulls / Rear Delts→**Face Pulls**. Old "Bench Press" + "Assisted Pull-ups" history lives on as swap options. Dropped lifts (Upright Row, Step-ups, Deadbugs, Plank, Bicep Curls, Tricep Pushdowns) keep their rows in the DB but no longer appear in any template.

### How bodyweight & time-based exercises work
- **Pure weighted** (Bench, Squat, etc.) — type both fields
- **Bodyweight that may be loaded** (Pull-ups, BSS, Box Jumps, Hip Abduction) — leave **lb** blank, type reps. History shows `BW × N`.
- **Time-based hold** (Copenhagen Plank) — `ExerciseDef` has `unit: "sec"`, the second input placeholder shows `sec`, history shows `BW × 60 sec`. The DB still stores the value in the `reps` integer column.
- **Rounds/carries** (Farmer Carries, `targetReps: "rounds"`) — log weight × rounds, or just enter what's meaningful.
- The save logic accepts `weight_lb: null` and skips fully empty set rows. Sets are only saved if reps OR weight is non-empty.
- **Alternatives**: when an exercise has `alternatives`, the active workout shows a "⇄ Swap exercise" control. Picking one logs under that name (its own history) and re-pulls its last-time/pre-fill. Reverting = pick the "default" chip.

## Design principles to follow

- **Gym-friendly UX first.** Big buttons, minimal typing, works with sweaty fingers. Offline-first where possible.
- **Teach as we build.** Explain new concepts in plain English before using them. User is learning the stack.
- **Data-driven UI.** Put domain data (disciplines, exercises) in arrays/constants, render with .map(). Easier to extend.
- **Small commits.** Git-commit meaningful milestones so we can always roll back.
- **No premature abstraction.** Build the simple thing first. Refactor when a pattern appears 3+ times.

## Common commands

```bash
# Start dev server
export PATH="/usr/local/bin:$PATH" && export npm_config_cache="$HOME/.npm-cache-new" && cd ~/dev/workout-app && npm run dev

# Production build (always run before pushing big changes — Vercel uses this)
export PATH="/usr/local/bin:$PATH" && export npm_config_cache="$HOME/.npm-cache-new" && cd ~/dev/workout-app && npm run build

# Install a new package
export PATH="/usr/local/bin:$PATH" && export npm_config_cache="$HOME/.npm-cache-new" && cd ~/dev/workout-app && npm install <pkg>

# Regenerate PWA icons (only if you change the design in scripts/make-icons.js)
export PATH="/usr/local/bin:$PATH" && cd ~/dev/workout-app && node scripts/make-icons.js

# Git status / commit / push (Vercel auto-deploys on push)
cd ~/dev/workout-app && git status
cd ~/dev/workout-app && git add . && git commit -m "message" && git push
```

## Live URLs

- **Production**: https://workout-app-seven-vert.vercel.app/
- **GitHub**: https://github.com/moloughlin16/workout-app
- **Supabase project**: https://supabase.com/dashboard/project/njyhpgxyvcxbnnqqjufj
- **Vercel dashboard**: https://vercel.com/ (search for `workout-app`)
