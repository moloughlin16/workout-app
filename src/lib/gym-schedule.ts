// Elevate MMA gym schedule — static data transcribed from the gym's schedule
// graphic. Used (in a future feature) to let the user quickly plan their
// training week: they see the classes and tap the ones they want to attend.
//
// If the gym's schedule ever changes, update this file — it's the single
// source of truth. Times are local (gym's time zone, same as user's).

export type GymClass = {
  /** Start time in "HH:MM" 24-hour format. */
  start: string;
  /** End time in "HH:MM" 24-hour format. */
  end: string;
  /** Display name of the class, e.g. "NoGi BJJ", "Kickboxing Fundamentals". */
  name: string;
  /** Discipline bucket matching our martial_arts_sessions table categories. */
  discipline: "MMA" | "Kickboxing" | "Grappling" | "Sparring" | "Other";
};

/**
 * Disciplines our martial_arts_sessions table accepts. Classes outside
 * this set (e.g. Ashtanga Yoga, Open Mat) can be PLANNED but can't be
 * quick-logged with "I went" because the DB check constraint would reject them.
 */
export const TRACKABLE_DISCIPLINES = new Set([
  "MMA",
  "Kickboxing",
  "Grappling",
  "Sparring",
]);

/** Tailwind color classes for each discipline. Used for dots/badges. */
export const DISCIPLINE_COLOR: Record<GymClass["discipline"], string> = {
  MMA: "bg-red-500",
  Kickboxing: "bg-orange-500",
  Grappling: "bg-blue-500",
  Sparring: "bg-purple-500",
  Other: "bg-zinc-400",
};

/** Compute a class's duration in minutes from its start/end strings. */
export function classDurationMin(cls: GymClass): number {
  const [sh, sm] = cls.start.split(":").map(Number);
  const [eh, em] = cls.end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export const GYM_SCHEDULE: Record<DayOfWeek, GymClass[]> = {
  Monday: [
    { start: "10:00", end: "11:30", name: "Ashtanga Yoga", discipline: "Other" },
    { start: "12:00", end: "13:00", name: "Gi BJJ", discipline: "Grappling" },
    { start: "13:00", end: "14:00", name: "Kickboxing", discipline: "Kickboxing" },
    { start: "16:30", end: "17:30", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "17:45", end: "18:45", name: "NoGi BJJ Fundamentals", discipline: "Grappling" },
    { start: "17:45", end: "18:45", name: "Intro to MMA", discipline: "MMA" },
    { start: "19:00", end: "20:00", name: "Kickboxing", discipline: "Kickboxing" },
    { start: "19:00", end: "20:00", name: "NoGi BJJ", discipline: "Grappling" },
  ],
  Tuesday: [
    { start: "07:30", end: "08:30", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "11:00", end: "12:00", name: "MMA", discipline: "MMA" },
    { start: "12:00", end: "13:00", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "16:30", end: "17:30", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "17:45", end: "18:45", name: "MMA", discipline: "MMA" },
    { start: "17:45", end: "18:45", name: "Kickboxing Fundamentals", discipline: "Kickboxing" },
    { start: "19:00", end: "20:00", name: "NoGi BJJ", discipline: "Grappling" },
  ],
  Wednesday: [
    { start: "10:00", end: "11:30", name: "Ashtanga Yoga", discipline: "Other" },
    { start: "12:00", end: "13:00", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "13:00", end: "14:00", name: "Kickboxing", discipline: "Kickboxing" },
    { start: "16:30", end: "17:30", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "17:45", end: "18:45", name: "Intro to MMA", discipline: "MMA" },
    { start: "17:45", end: "18:45", name: "NoGi BJJ Fundamentals", discipline: "Grappling" },
    { start: "19:00", end: "20:30", name: "MMA Sparring", discipline: "Sparring" },
  ],
  Thursday: [
    { start: "07:30", end: "08:30", name: "Gi BJJ", discipline: "Grappling" },
    { start: "12:00", end: "13:00", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "16:30", end: "17:30", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "17:45", end: "18:45", name: "Kickboxing Fundamentals", discipline: "Kickboxing" },
    { start: "17:45", end: "18:45", name: "MMA", discipline: "MMA" },
    { start: "19:00", end: "20:00", name: "Technical Kickboxing Sparring", discipline: "Sparring" },
    { start: "19:00", end: "20:00", name: "NoGi BJJ", discipline: "Grappling" },
  ],
  Friday: [
    { start: "11:00", end: "12:00", name: "MMA", discipline: "MMA" },
    { start: "12:00", end: "13:00", name: "Open Mat", discipline: "Grappling" },
    { start: "17:45", end: "18:45", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "18:45", end: "19:45", name: "NoGi BJJ Rolling", discipline: "Grappling" },
    { start: "19:45", end: "21:00", name: "Los Lobos Wrestling", discipline: "Grappling" },
  ],
  Saturday: [
    { start: "10:30", end: "11:30", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "10:30", end: "11:30", name: "Kickboxing", discipline: "Kickboxing" },
    { start: "11:30", end: "13:00", name: "Open Mat", discipline: "Grappling" },
  ],
  Sunday: [
    { start: "11:30", end: "12:30", name: "Women & Nonbinary Open Mat", discipline: "Grappling" },
    { start: "13:00", end: "14:00", name: "Gi BJJ", discipline: "Grappling" },
    { start: "14:00", end: "15:00", name: "NoGi BJJ", discipline: "Grappling" },
    { start: "15:00", end: "16:30", name: "Los Lobos Wrestling", discipline: "Grappling" },
  ],
};
