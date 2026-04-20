// Temporary color-scheme preview page. Delete this file after the user
// picks a palette and we roll it out to the real app.
//
// Each <Palette /> block renders the same set of representative UI
// components (progress card, big button, AI summary, session row) so
// they can be compared directly.

// ============================================================
// PALETTE DEFINITIONS
// Tailwind class strings for the key roles in each theme.
// ============================================================

type Palette = {
  id: string;
  name: string;
  tagline: string;
  // Background + text for the whole block
  pageBg: string;
  // Primary: main CTA buttons, selected tabs, progress bar fill
  primaryBg: string;
  primaryBgHover: string;
  primaryText: string;
  primaryRing: string;
  // Accent 1: big weekly-progress hero card background + progress bar
  heroGradient: string; // optional: a gradient or solid bg for the hero card
  progressFill: string; // progress bar filled color
  // Accent 2: AI summary card (the "generate text" purple in current app)
  aiCardBg: string;
  aiBorder: string;
  aiHeaderText: string;
  aiButtonBg: string;
  // Accent 3: PR banner (the amber color in current app)
  prBg: string;
  prBorder: string;
  prText: string;
  // Accent 4: delete / destructive
  deleteHover: string;
  // Utility
  cardBg: string;
  cardBorder: string;
  quietText: string;
};

const PALETTES: Palette[] = [
  {
    id: "A",
    name: "A · Warm & energizing",
    tagline: "Orange primary. Workout-fitness vibe, high energy.",
    pageBg: "bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100",
    primaryBg: "bg-orange-500",
    primaryBgHover: "hover:bg-orange-600",
    primaryText: "text-orange-600 dark:text-orange-400",
    primaryRing: "focus:ring-orange-500",
    heroGradient: "bg-gradient-to-br from-orange-500 to-red-500",
    progressFill: "bg-orange-500",
    aiCardBg: "bg-pink-50 dark:bg-pink-950/30",
    aiBorder: "border-pink-200 dark:border-pink-800",
    aiHeaderText: "text-pink-700 dark:text-pink-300",
    aiButtonBg: "bg-pink-600",
    prBg: "bg-amber-50 dark:bg-amber-900/20",
    prBorder: "border-amber-300 dark:border-amber-700/50",
    prText: "text-amber-900 dark:text-amber-200",
    deleteHover: "hover:text-red-500",
    cardBg: "bg-white dark:bg-zinc-900",
    cardBorder: "border-zinc-200 dark:border-zinc-800",
    quietText: "text-zinc-500",
  },
  {
    id: "B",
    name: "B · Cool & focused",
    tagline: "Indigo/cyan. Tech-forward, calm, 'training mode'.",
    pageBg: "bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100",
    primaryBg: "bg-indigo-600",
    primaryBgHover: "hover:bg-indigo-700",
    primaryText: "text-indigo-600 dark:text-indigo-400",
    primaryRing: "focus:ring-indigo-500",
    heroGradient: "bg-gradient-to-br from-indigo-600 to-cyan-500",
    progressFill: "bg-cyan-500",
    aiCardBg: "bg-violet-50 dark:bg-violet-950/30",
    aiBorder: "border-violet-200 dark:border-violet-800",
    aiHeaderText: "text-violet-700 dark:text-violet-300",
    aiButtonBg: "bg-violet-600",
    prBg: "bg-sky-50 dark:bg-sky-900/20",
    prBorder: "border-sky-300 dark:border-sky-700/50",
    prText: "text-sky-900 dark:text-sky-200",
    deleteHover: "hover:text-rose-500",
    cardBg: "bg-white dark:bg-slate-900",
    cardBorder: "border-slate-200 dark:border-slate-800",
    quietText: "text-slate-500",
  },
  {
    id: "C",
    name: "C · Teal / emerald",
    tagline: "Close to current but cooler. A tweak, not an overhaul.",
    pageBg: "bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100",
    primaryBg: "bg-emerald-600",
    primaryBgHover: "hover:bg-emerald-700",
    primaryText: "text-emerald-600 dark:text-emerald-400",
    primaryRing: "focus:ring-emerald-500",
    heroGradient: "bg-gradient-to-br from-emerald-500 to-teal-600",
    progressFill: "bg-emerald-500",
    aiCardBg: "bg-teal-50 dark:bg-teal-950/30",
    aiBorder: "border-teal-200 dark:border-teal-800",
    aiHeaderText: "text-teal-700 dark:text-teal-300",
    aiButtonBg: "bg-teal-600",
    prBg: "bg-amber-50 dark:bg-amber-900/20",
    prBorder: "border-amber-300 dark:border-amber-700/50",
    prText: "text-amber-900 dark:text-amber-200",
    deleteHover: "hover:text-rose-500",
    cardBg: "bg-white dark:bg-zinc-900",
    cardBorder: "border-zinc-200 dark:border-zinc-800",
    quietText: "text-zinc-500",
  },
  {
    id: "D",
    name: "D · Monochrome + red accent",
    tagline: "Lots of zinc greys. One bold accent. Apple-esque minimalism.",
    pageBg: "bg-white dark:bg-black text-zinc-900 dark:text-zinc-100",
    primaryBg: "bg-zinc-900 dark:bg-white",
    primaryBgHover: "hover:bg-zinc-800 dark:hover:bg-zinc-200",
    primaryText: "text-rose-600 dark:text-rose-400",
    primaryRing: "focus:ring-rose-500",
    heroGradient: "bg-zinc-900 dark:bg-zinc-800",
    progressFill: "bg-rose-600",
    aiCardBg: "bg-zinc-100 dark:bg-zinc-900",
    aiBorder: "border-zinc-300 dark:border-zinc-700",
    aiHeaderText: "text-zinc-900 dark:text-zinc-100",
    aiButtonBg: "bg-zinc-900 dark:bg-white",
    prBg: "bg-zinc-100 dark:bg-zinc-900",
    prBorder: "border-rose-600",
    prText: "text-rose-700 dark:text-rose-300",
    deleteHover: "hover:text-rose-600",
    cardBg: "bg-zinc-50 dark:bg-zinc-900",
    cardBorder: "border-zinc-200 dark:border-zinc-800",
    quietText: "text-zinc-500",
  },
];

/** Mockup section showing one palette applied to representative UI. */
function PaletteDemo({ palette: p }: { palette: Palette }) {
  const isDark = p.id === "D"; // Monochrome looks best on pure black dark mode

  return (
    <section className={`${p.pageBg} rounded-3xl p-5 mb-6 border border-zinc-200 dark:border-zinc-800 shadow-sm`}>
      <div className="mb-4">
        <h2 className="text-lg font-bold">{p.name}</h2>
        <p className={`text-xs ${p.quietText}`}>{p.tagline}</p>
      </div>

      {/* Weekly-progress hero card */}
      <div className={`${p.heroGradient} text-white p-5 rounded-2xl mb-3 shadow-sm`}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium opacity-80">This week</span>
          <span className="text-xs opacity-70">Goal: 10h</span>
        </div>
        <div className="text-3xl font-bold mt-2">
          7.5h <span className="text-base font-normal opacity-80">(6 classes)</span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-white/20 overflow-hidden">
          <div className="h-full bg-white rounded-full" style={{ width: "75%" }} />
        </div>
      </div>

      {/* Grid of representative smaller cards */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className={`${p.cardBg} ${p.cardBorder} border p-3 rounded-xl`}>
          <div className={`text-xs ${p.quietText}`}>Lifts this week</div>
          <div className="text-xl font-bold">2/2</div>
          <div className={`mt-2 h-1.5 w-full rounded-full ${isDark ? "bg-zinc-800" : "bg-zinc-200 dark:bg-zinc-800"} overflow-hidden`}>
            <div className={`h-full ${p.progressFill}`} style={{ width: "100%" }} />
          </div>
        </div>
        <div className={`${p.cardBg} ${p.cardBorder} border p-3 rounded-xl flex flex-col justify-between`}>
          <div className={`text-xs ${p.quietText}`}>Next class</div>
          <div className="text-sm font-semibold truncate">NoGi BJJ</div>
          <div className={`text-xs ${p.quietText}`}>5:45pm</div>
        </div>
      </div>

      {/* Quick-log button row (mirrors big martial arts buttons) */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button className={`${p.cardBg} ${p.cardBorder} border aspect-[2/1] rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm`}>
          <span className="text-2xl">🥋</span>
          <span className="text-sm font-semibold">MMA</span>
        </button>
        <button className={`${p.cardBg} ${p.cardBorder} border aspect-[2/1] rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm`}>
          <span className="text-2xl">🥊</span>
          <span className="text-sm font-semibold">Kickboxing</span>
        </button>
      </div>

      {/* Primary CTA (like Finish Workout) */}
      <button
        className={`${p.primaryBg} ${p.primaryBgHover} ${isDark ? "text-white dark:text-black" : "text-white"} w-full py-3 rounded-xl font-semibold mb-3`}
      >
        Finish Workout
      </button>

      {/* AI summary-style card */}
      <div className={`${p.aiCardBg} ${p.aiBorder} border p-4 rounded-xl mb-3`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className={`text-sm font-semibold ${p.aiHeaderText}`}>
            ✨ AI Weekly Summary
          </h3>
          <span className={`text-xs ${p.quietText}`}>Dismiss</span>
        </div>
        <p className="text-xs leading-relaxed">
          Solid week — three grappling sessions, a sparring class, and a steady lift day. Consider pushing the bench up five pounds next week.
        </p>
        <button className={`mt-2 ${p.aiButtonBg} text-white text-xs font-medium px-3 py-1.5 rounded-lg`}>
          Regenerate
        </button>
      </div>

      {/* PR banner */}
      <div className={`${p.prBg} ${p.prBorder} border p-3 rounded-xl mb-3`}>
        <div className={`text-sm font-bold ${p.prText} flex items-center gap-1 mb-1`}>
          🏆 New PR!
        </div>
        <div className={`text-xs ${p.prText}`}>
          Squat — 165 lb (was 155)
        </div>
      </div>

      {/* Past session row */}
      <div className={`${p.cardBg} ${p.cardBorder} border p-3 rounded-xl flex items-start gap-3`}>
        <span className="text-xl">🏋️</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Full Body 1</div>
          <div className={`text-xs ${p.quietText}`}>Yesterday · 24 sets · 📝</div>
          <div className={`text-xs mt-1 ${p.quietText}`}>
            Felt strong, bench moved easy. Low back a little tight.
          </div>
        </div>
        <button className={`text-zinc-400 ${p.deleteHover} text-xl px-2`}>
          ×
        </button>
      </div>

      {/* Tag pill example */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["guard-retention", "sweep", "head-movement"].map((t) => (
          <span
            key={t}
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
              p.id === "A"
                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300"
                : p.id === "B"
                  ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300"
                  : p.id === "C"
                    ? "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            }`}
          >
            #{t}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function ColorPreviewPage() {
  return (
    <main className="min-h-screen bg-zinc-100 dark:bg-zinc-950 p-4 max-w-md mx-auto pb-24">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Color palettes</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Preview each option. Tell me which you want and I&apos;ll roll it out across the app.
        </p>
      </header>

      {PALETTES.map((p) => (
        <PaletteDemo key={p.id} palette={p} />
      ))}

      <div className="text-center text-xs text-zinc-400 mt-4">
        This is a preview page. It&apos;ll be removed after you pick.
      </div>
    </main>
  );
}
