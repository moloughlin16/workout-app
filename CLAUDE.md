# Workout App — Project Context for Claude

**Read this file first every session.** It's the living memory of the project.

## What this is

A personal workout + martial arts tracking web app (PWA) for the user. Completely free tech stack, built solo while learning.

## User context

- New to JavaScript / TypeScript / React — wants concepts explained as we build
- Trains martial arts: MMA, Kickboxing, BJJ/Grappling, Sparring (1-hour classes)
- Goal: 10 hours/week of martial arts (2-3 MMA, 2-4 kickboxing, 2-4 grappling, 1 sparring)
- Lifts twice a week (Day A Strength, Day B Power — templates below)
- Has Apple Watch, no privacy concerns
- Mac (Apple Silicon? check with `uname -m` if needed) — Node installed via .pkg at `/usr/local/bin/node`

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Supabase** (Postgres) — set up, project `njyhpgxyvcxbnnqqjufj`, anon key in `.env.local`
- **GitHub** — `https://github.com/moloughlin16/workout-app` (push works without PAT, creds cached in macOS Keychain)
- **Vercel** for deployment — NOT YET SET UP
- **Claude API** for AI features — future phase

## Important environment quirks

- `node` is at `/usr/local/bin/node` but NOT on the default PATH in Claude Code shells. **Always prepend `export PATH="/usr/local/bin:$PATH"` before running npm/node/npx.**
- The npm cache at `~/.npm/_cacache` has root-owned files that can't be removed without sudo. **Always set `export npm_config_cache="$HOME/.npm-cache-new"`** to work around this. Both env vars together:
  ```
  export PATH="/usr/local/bin:$PATH" && export npm_config_cache="$HOME/.npm-cache-new"
  ```
- Project lives at `~/Documents/workout-app`
- Dev server: `npm run dev` → http://localhost:3000

## Current status

### Completed
- [x] Scaffolded Next.js + TS + Tailwind + App Router + src dir + import alias `@/*`
- [x] Replaced starter page with martial arts quick-log buttons (4 disciplines: MMA, Kickboxing, Grappling, Sparring)
- [x] Client-side state with `useState` showing "Logged X ✓" confirmation
- [x] `git init` + first commit
- [x] GitHub remote set up, push works
- [x] Supabase project created, `.env.local` populated with URL + anon key
- [x] `martial_arts_sessions` table created with RLS + permissive anon policy
- [x] `@supabase/supabase-js` installed, `src/lib/supabase.ts` client created
- [x] `handleLog` wired to insert rows
- [x] Weekly progress panel: hours + class count + progress bar + per-discipline breakdown
- [x] Loading/saving/error UI states

### Database schema

**martial_arts_sessions**
- id (uuid pk, default gen_random_uuid)
- date (date, default current_date)
- discipline (text, check: MMA/Kickboxing/Grappling/Sparring)
- duration_min (int, default 60)
- notes (text, nullable)
- created_at (timestamptz, default now)
- RLS enabled, policy "allow all for anon" (FOR ALL, USING true, WITH CHECK true)

### Next session plan

**Phase 1, Feature 2: lift tracker with Day A / Day B templates.**

1. Design schema: `exercises`, `workout_templates`, `lift_sessions`, `lift_sets`
2. Seed the user's Day A / Day B templates (see below — use SQL or a Supabase seed script)
3. New route `/lift` for lifting workouts (create `src/app/lift/page.tsx`)
4. UI: pick day → see list of exercises with last-time weights → enter sets (weight/reps) → save
5. "Last time" reference fetched per exercise for quick comparison
6. Minimal bottom nav so user can flip between home (martial arts) and /lift
7. RPE field (optional, 1-10 scale)
8. Commit + push

**Also worth tackling in the same session (if time):**
- Add a small "recent sessions" list on the martial arts page (last 5 classes)
- Add long-press or edit-on-tap on a class to change duration/delete (right now it's always 60 min)

### Known followups / debt
- Auth not set up — currently using permissive RLS policy. Fine for personal use but MUST add auth before sharing or deploying publicly.
- Edit/delete UX: no way to fix a misclick yet. Add either swipe-to-delete or a "recent sessions" list with edit buttons.
- Class duration hardcoded to 60. Add a long-press to enter custom duration for sparring or extra-long classes.
- No date picker — all logs go to "today". Add back-dating for end-of-day logging of yesterday's classes.

### Roadmap after that (do not build yet — order subject to change)

- Lift tracker with Day A / Day B templates (see below)
- Per-exercise progress charts + PR detection
- Calendar/heatmap view
- Daily notes + mood/sleep/soreness
- Injury/pain log
- Sparring partner log + technique tags
- Apple Watch → Shortcuts → webhook → Supabase for auto HR/calories/sleep
- Body weight + progress photos
- Smart rest timer
- Cycle tracking
- AI weekly summary (Claude API)
- Goal setting with progress bars

## User's lifting templates (seed these when building the lift tracker)

### Day A — Strength (controlled, submaximal)
1. Main Lower: Squat OR Trap bar deadlift — 3–4 × 3–5 (rest 2.5–3.5 min)
2. Main Upper Push: DB or BB bench press — 3 × 4–6 (rest 2–3 min)
3. Chest-Supported Row — 3 × 6–10 (rest 1.5–2 min)
4. Bulgarian Split Squat — 2–3 × 6–8 each leg (rest 60–90 sec between legs, 90 sec between sets)
5. Step-ups (bodyweight, controlled) — 2–3 × 6–10 each leg (rest ~60 sec)
6. Core: Hanging leg raises or plank — 2–3 sets (rest 45–75 sec)
7. Optional: Hip abduction — 1–2 × 12–15 (rest 45–60 sec)

### Day B — Power (explosive, upper-body bias)
1. Explosive Movement: Box jumps or KB swings — 3–5 × 5–8 (rest 1.5–2 min, full recovery)
2. Posterior Chain: RDL or SLDL — 3 × 5–8 (rest 2–3 min)
3. Overhead Press — 3 × 5–8 (rest 2 min)
4. Row (DB or cable) — 3 × 6–10 (rest 1.5–2 min)
5. Lateral Raises — 2–3 × 12–15 (rest 45–60 sec)
6. Face Pulls / Rear Delts — 2–3 × 12–15 (rest 45–60 sec)
7. Hamstring Curls — 2–3 × 8–12 (rest 60–90 sec)
8. Optional (aesthetic): Bicep curls or tricep pushdowns — 1–2 sets (rest 45–60 sec)

## Design principles to follow

- **Gym-friendly UX first.** Big buttons, minimal typing, works with sweaty fingers. Offline-first where possible.
- **Teach as we build.** Explain new concepts in plain English before using them. User is learning the stack.
- **Data-driven UI.** Put domain data (disciplines, exercises) in arrays/constants, render with .map(). Easier to extend.
- **Small commits.** Git-commit meaningful milestones so we can always roll back.
- **No premature abstraction.** Build the simple thing first. Refactor when a pattern appears 3+ times.

## Common commands

```bash
# Start dev server
export PATH="/usr/local/bin:$PATH" && export npm_config_cache="$HOME/.npm-cache-new" && cd ~/Documents/workout-app && npm run dev

# Install a new package
export PATH="/usr/local/bin:$PATH" && export npm_config_cache="$HOME/.npm-cache-new" && cd ~/Documents/workout-app && npm install <pkg>

# Git status
cd ~/Documents/workout-app && git status

# Quick commit
cd ~/Documents/workout-app && git add . && git commit -m "message"
```
