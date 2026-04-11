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
  - Loading/saving/error UI states
- [x] **Lift tracker** (`src/app/lift/page.tsx`):
  - Day A / Day B template picker
  - Templates defined in-file as `TEMPLATES` constant (easy to edit)
  - Active workout view: per-exercise cards with inputs for each set (weight × reps)
  - "Last time" hint per exercise via query of most recent `lift_sets` row
  - Add/remove individual sets
  - "Finish Workout" inserts parent `lift_sessions` row then bulk-inserts `lift_sets`
- [x] **Bottom nav** (`src/components/BottomNav.tsx`): fixed nav bar with Martial Arts + Lift tabs, active-tab highlight via `usePathname()`
- [x] `src/lib/supabase.ts` shared client

### Database schema

**martial_arts_sessions**
- id (uuid pk, default gen_random_uuid)
- date (date, default current_date)
- discipline (text, check: MMA/Kickboxing/Grappling/Sparring)
- duration_min (int, default 60)
- notes (text, nullable)
- created_at (timestamptz, default now)
- RLS enabled, policy "allow all for anon"

**lift_sessions**
- id (uuid pk)
- date (date, default current_date)
- template_name (text, check: 'Day A' / 'Day B' / 'Custom')
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

### Next session plan — DEPLOY

**Top priority: get this on the user's phone via Vercel + PWA.**

The app is feature-complete enough for daily use. The single biggest lift-in-utility next is deploying so they can actually use it at the gym.

1. Sign user in to Vercel (GitHub OAuth)
2. Import `moloughlin16/workout-app` from GitHub
3. Add env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) in Vercel dashboard
4. Deploy; get the vercel.app URL
5. Add PWA manifest (`public/manifest.json`) + icons
6. Add `<link rel="manifest" />` in layout.tsx metadata
7. Show user how to "Add to Home Screen" on iOS Safari
8. Test on phone; log a real class from phone

### Followups / debt (not urgent)
- Auth not set up — permissive RLS policy is fine for personal/private use.
- No edit/delete UX on martial arts classes. Add "recent sessions" list with swipe-to-delete.
- Martial arts duration hardcoded to 60. Long-press to customize.
- No backdating — all logs go to "today".
- No RPE input on lift tracker yet (column exists, just not wired to UI).
- Lift session notes field not surfaced in UI.

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
