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
- **Supabase** (Postgres + auth) — NOT YET SET UP
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
- [ ] GitHub remote — TBD
- [ ] Supabase setup — NEXT

### Next session plan

**Phase 1, Feature 1: make the buttons actually save to a real database.**

1. User creates free Supabase account at supabase.com
2. Create project, grab URL + anon key, put in `.env.local`
3. Create `martial_arts_sessions` table via SQL editor:
   - id (uuid, pk, default gen_random_uuid())
   - user_id (uuid, nullable for now — single-user app)
   - date (date, default current_date)
   - discipline (text, check constraint on MMA/Kickboxing/Grappling/Sparring)
   - duration_min (int, default 60)
   - notes (text, nullable)
   - created_at (timestamptz, default now())
4. `npm install @supabase/supabase-js`
5. Create `src/lib/supabase.ts` client
6. Wire `handleLog` in `src/app/page.tsx` to insert a row
7. Add "This week" hours counter at top of page (fetch + sum)
8. Show loading state + error handling
9. Teach user how to view rows in Supabase dashboard

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
