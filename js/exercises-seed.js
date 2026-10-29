// Default exercise catalog.
// Used to seed LocalStore, and mirrored by the INSERT block at the bottom of schema.sql.
// If you change this list, update schema.sql too (same name + equipment pairs, and the
// `muscles` array = `primary`).
//
// The same movement on different equipment is a separate exercise on purpose, so
// "Bench Press / barbell" and "Bench Press / smith" track progress independently.
//
// `primary` / `secondary` use the body-map region names in MUSCLES (see js/bodymap.js),
// so the muscle map works for every seed exercise even without a photo match.

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "smith",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
];

export const MUSCLE_GROUPS = ["chest", "back", "shoulders", "legs", "arms", "core", "other"];

/** Body-map regions, in the order they are offered in the "New exercise" form. */
export const MUSCLES = [
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "traps",
  "lats",
  "middle back",
  "lower back",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
];

/** Stable lookup key for an exercise: "bench press|barbell". */
export function exerciseKey(ex) {
  return `${String(ex?.name || "").trim().toLowerCase()}|${ex?.equipment || "other"}`;
}

let seedByKey = null;

/**
 * Primary and secondary muscles for any exercise row. Seed exercises use the curated
 * lists below; custom exercises use their stored `muscles` (all treated as primary).
 */
export function musclesFor(ex) {
  if (!ex) return { primary: [], secondary: [] };
  if (!seedByKey) seedByKey = new Map(EXERCISE_SEED.map((e) => [exerciseKey(e), e]));
  const seed = seedByKey.get(exerciseKey(ex));
  if (seed) return { primary: [...seed.primary], secondary: [...seed.secondary] };
  const own = Array.isArray(ex.muscles) ? ex.muscles.filter((m) => MUSCLES.includes(m)) : [];
  return { primary: own, secondary: [] };
}

/** The seed's primary muscles for a name + equipment pair, or [] for a custom exercise. */
export function seedMuscles(name, equipment) {
  if (!seedByKey) seedByKey = new Map(EXERCISE_SEED.map((e) => [exerciseKey(e), e]));
  return [...(seedByKey.get(exerciseKey({ name, equipment }))?.primary || [])];
}

export const EXERCISE_SEED = [
  // Barbell ("rack / free weights")
  { name: "Bench Press", equipment: "barbell", muscle_group: "chest", primary: ["chest"], secondary: ["shoulders", "triceps"] },
  { name: "Incline Bench Press", equipment: "barbell", muscle_group: "chest", primary: ["chest", "shoulders"], secondary: ["triceps"] },
  { name: "Back Squat", equipment: "barbell", muscle_group: "legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors", "lower back"] },
  { name: "Front Squat", equipment: "barbell", muscle_group: "legs", primary: ["quads"], secondary: ["glutes", "adductors", "abs"] },
  { name: "Deadlift", equipment: "barbell", muscle_group: "back", primary: ["hamstrings", "glutes", "lower back"], secondary: ["traps", "lats", "forearms", "quads"] },
  { name: "Romanian Deadlift", equipment: "barbell", muscle_group: "legs", primary: ["hamstrings", "glutes"], secondary: ["lower back", "forearms"] },
  { name: "Overhead Press", equipment: "barbell", muscle_group: "shoulders", primary: ["shoulders"], secondary: ["triceps", "traps", "abs"] },
  { name: "Bent-Over Row", equipment: "barbell", muscle_group: "back", primary: ["lats", "middle back"], secondary: ["biceps", "shoulders", "lower back", "forearms"] },
  { name: "Biceps Curl", equipment: "barbell", muscle_group: "arms", primary: ["biceps"], secondary: ["forearms"] },
  { name: "Hip Thrust", equipment: "barbell", muscle_group: "legs", primary: ["glutes"], secondary: ["hamstrings", "quads"] },

  // Dumbbell
  { name: "Bench Press", equipment: "dumbbell", muscle_group: "chest", primary: ["chest"], secondary: ["shoulders", "triceps"] },
  { name: "Incline Bench Press", equipment: "dumbbell", muscle_group: "chest", primary: ["chest", "shoulders"], secondary: ["triceps"] },
  { name: "Chest Fly", equipment: "dumbbell", muscle_group: "chest", primary: ["chest"], secondary: ["shoulders"] },
  { name: "Shoulder Press", equipment: "dumbbell", muscle_group: "shoulders", primary: ["shoulders"], secondary: ["triceps", "traps"] },
  { name: "Lateral Raise", equipment: "dumbbell", muscle_group: "shoulders", primary: ["shoulders"], secondary: ["traps"] },
  { name: "One-Arm Row", equipment: "dumbbell", muscle_group: "back", primary: ["lats", "middle back"], secondary: ["biceps", "shoulders"] },
  { name: "Biceps Curl", equipment: "dumbbell", muscle_group: "arms", primary: ["biceps"], secondary: ["forearms"] },
  { name: "Hammer Curl", equipment: "dumbbell", muscle_group: "arms", primary: ["biceps", "forearms"], secondary: [] },
  { name: "Goblet Squat", equipment: "dumbbell", muscle_group: "legs", primary: ["quads", "glutes"], secondary: ["adductors", "abs"] },
  { name: "Walking Lunge", equipment: "dumbbell", muscle_group: "legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors", "calves"] },
  { name: "Romanian Deadlift", equipment: "dumbbell", muscle_group: "legs", primary: ["hamstrings", "glutes"], secondary: ["lower back", "forearms"] },

  // Machine
  { name: "Leg Press", equipment: "machine", muscle_group: "legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors"] },
  { name: "Leg Extension", equipment: "machine", muscle_group: "legs", primary: ["quads"], secondary: [] },
  { name: "Leg Curl", equipment: "machine", muscle_group: "legs", primary: ["hamstrings"], secondary: ["calves"] },
  { name: "Calf Raise", equipment: "machine", muscle_group: "legs", primary: ["calves"], secondary: [] },
  { name: "Chest Press", equipment: "machine", muscle_group: "chest", primary: ["chest"], secondary: ["shoulders", "triceps"] },
  { name: "Pec Deck", equipment: "machine", muscle_group: "chest", primary: ["chest"], secondary: ["shoulders"] },
  { name: "Shoulder Press", equipment: "machine", muscle_group: "shoulders", primary: ["shoulders"], secondary: ["triceps"] },

  // Smith machine
  { name: "Bench Press", equipment: "smith", muscle_group: "chest", primary: ["chest"], secondary: ["shoulders", "triceps"] },
  { name: "Incline Bench Press", equipment: "smith", muscle_group: "chest", primary: ["chest", "shoulders"], secondary: ["triceps"] },
  { name: "Squat", equipment: "smith", muscle_group: "legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors"] },

  // Cable
  { name: "Lat Pulldown", equipment: "cable", muscle_group: "back", primary: ["lats"], secondary: ["biceps", "middle back", "forearms"] },
  { name: "Seated Row", equipment: "cable", muscle_group: "back", primary: ["middle back", "lats"], secondary: ["biceps", "shoulders", "forearms"] },
  { name: "Triceps Pushdown", equipment: "cable", muscle_group: "arms", primary: ["triceps"], secondary: [] },
  { name: "Face Pull", equipment: "cable", muscle_group: "shoulders", primary: ["shoulders"], secondary: ["traps", "middle back"] },
  { name: "Cable Fly", equipment: "cable", muscle_group: "chest", primary: ["chest"], secondary: ["shoulders"] },
  { name: "Cable Crunch", equipment: "cable", muscle_group: "core", primary: ["abs"], secondary: ["obliques"] },

  // Bodyweight (log added weight in lb, or 0 for bodyweight only)
  { name: "Pull-Up", equipment: "bodyweight", muscle_group: "back", primary: ["lats"], secondary: ["biceps", "middle back", "forearms"] },
  { name: "Chin-Up", equipment: "bodyweight", muscle_group: "back", primary: ["lats", "biceps"], secondary: ["middle back", "forearms"] },
  { name: "Push-Up", equipment: "bodyweight", muscle_group: "chest", primary: ["chest"], secondary: ["shoulders", "triceps", "abs"] },
  { name: "Dip", equipment: "bodyweight", muscle_group: "chest", primary: ["chest", "triceps"], secondary: ["shoulders"] },
  { name: "Hanging Leg Raise", equipment: "bodyweight", muscle_group: "core", primary: ["abs"], secondary: ["obliques", "forearms"] },

  // Kettlebell
  { name: "Kettlebell Swing", equipment: "kettlebell", muscle_group: "legs", primary: ["glutes", "hamstrings"], secondary: ["lower back", "shoulders", "quads", "abs"] },
];
