// One-off build step: download free-exercise-db and write js/exercise-info.js.
//
//   node tools/build-exercise-info.mjs
//
// free-exercise-db (https://github.com/yuhonas/free-exercise-db) is public domain
// (Unlicense). We don't load its 876-entry JSON at runtime; this script picks the
// entries that match our seed exercises (hand-curated MAP below) and writes a small
// module with two step photos, the written instructions and the muscles for each.
//
// Re-run it after changing MAP or adding seed exercises. Needs Node 18+ (global fetch).

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EXERCISE_SEED, exerciseKey, MUSCLES } from "../js/exercises-seed.js";

const SOURCE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const OUT = fileURLToPath(new URL("../js/exercise-info.js", import.meta.url));

// Our seed exercise (name|equipment) -> free-exercise-db `name`.
// Matched by hand: same movement, same equipment where the database has it.
// Entries marked "approx." are the closest movement the database offers.
const MAP = {
  "bench press|barbell": "Barbell Bench Press - Medium Grip",
  "incline bench press|barbell": "Barbell Incline Bench Press - Medium Grip",
  "back squat|barbell": "Barbell Squat",
  "front squat|barbell": "Front Barbell Squat",
  "deadlift|barbell": "Barbell Deadlift",
  "romanian deadlift|barbell": "Romanian Deadlift",
  "overhead press|barbell": "Standing Military Press",
  "bent-over row|barbell": "Bent Over Barbell Row",
  "biceps curl|barbell": "Barbell Curl",
  "hip thrust|barbell": "Barbell Hip Thrust",

  "bench press|dumbbell": "Dumbbell Bench Press",
  "incline bench press|dumbbell": "Incline Dumbbell Press",
  "chest fly|dumbbell": "Dumbbell Flyes",
  "shoulder press|dumbbell": "Dumbbell Shoulder Press",
  "lateral raise|dumbbell": "Side Lateral Raise",
  "one-arm row|dumbbell": "One-Arm Dumbbell Row",
  "biceps curl|dumbbell": "Dumbbell Bicep Curl",
  "hammer curl|dumbbell": "Hammer Curls",
  "goblet squat|dumbbell": "Goblet Squat", // database shows it with a kettlebell
  "walking lunge|dumbbell": "Dumbbell Lunges",
  "romanian deadlift|dumbbell": "Stiff-Legged Dumbbell Deadlift", // approx.

  "leg press|machine": "Leg Press",
  "leg extension|machine": "Leg Extensions",
  "leg curl|machine": "Lying Leg Curls",
  "calf raise|machine": "Standing Calf Raises",
  "chest press|machine": "Leverage Chest Press",
  "pec deck|machine": "Butterfly",
  "shoulder press|machine": "Machine Shoulder (Military) Press",

  "bench press|smith": "Smith Machine Bench Press",
  "incline bench press|smith": "Smith Machine Incline Bench Press",
  "squat|smith": "Smith Machine Squat",

  "lat pulldown|cable": "Wide-Grip Lat Pulldown",
  "seated row|cable": "Seated Cable Rows",
  "triceps pushdown|cable": "Triceps Pushdown",
  "face pull|cable": "Face Pull",
  "cable fly|cable": "Cable Crossover",
  "cable crunch|cable": "Cable Crunch",

  "pull-up|bodyweight": "Pullups",
  "chin-up|bodyweight": "Chin-Up",
  "push-up|bodyweight": "Pushups",
  "dip|bodyweight": "Dips - Chest Version",
  "hanging leg raise|bodyweight": "Hanging Leg Raise",

  "kettlebell swing|kettlebell": "One-Arm Kettlebell Swings", // approx.: no two-hand swing in the database
};

// The database entry for "One-Arm Kettlebell Swings" has photos but no written steps.
// These short steps are our own, used only when the database has none.
const INSTRUCTION_FALLBACK = {
  "kettlebell swing|kettlebell": [
    "Stand with feet a little wider than hip width, kettlebell on the floor about a foot in front of you.",
    "Hinge at the hips with a flat back and grab the handle with both hands. Hike the bell back between your legs.",
    "Drive your hips forward hard and squeeze your glutes so the bell floats up to about chest height. Your arms just guide it.",
    "Let the bell fall back, hinge again as your forearms meet your thighs, and go straight into the next rep.",
  ],
};

// free-exercise-db muscle names -> our body-map regions.
const MUSCLE_MAP = {
  abdominals: "abs",
  abductors: "glutes",
  adductors: "adductors",
  biceps: "biceps",
  calves: "calves",
  chest: "chest",
  forearms: "forearms",
  glutes: "glutes",
  hamstrings: "hamstrings",
  lats: "lats",
  "lower back": "lower back",
  "middle back": "middle back",
  neck: "traps",
  quadriceps: "quads",
  shoulders: "shoulders",
  traps: "traps",
  triceps: "triceps",
};

function regions(list) {
  const out = [];
  for (const m of list || []) {
    const r = MUSCLE_MAP[m];
    if (r && MUSCLES.includes(r) && !out.includes(r)) out.push(r);
  }
  return out;
}

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
const db = await res.json();
const byName = new Map(db.map((e) => [e.name, e]));
console.log(`free-exercise-db: ${db.length} exercises`);

const info = {};
const unmatched = [];
for (const seed of EXERCISE_SEED) {
  const key = exerciseKey(seed);
  const target = MAP[key];
  const entry = target && byName.get(target);
  if (!entry) {
    unmatched.push(`${key}${target ? ` (mapped to missing "${target}")` : ""}`);
    continue;
  }
  const primary = regions(entry.primaryMuscles);
  const secondary = regions(entry.secondaryMuscles).filter((m) => !primary.includes(m));
  const instructions = (entry.instructions || []).map((s) => s.trim()).filter(Boolean);
  info[key] = {
    source: entry.name,
    images: (entry.images || []).slice(0, 2),
    instructions: instructions.length ? instructions : INSTRUCTION_FALLBACK[key] || [],
    primary,
    secondary,
  };
  if (!instructions.length) console.log(`  note: "${entry.name}" has no instructions${INSTRUCTION_FALLBACK[key] ? " (using fallback)" : ""}`);
  if ((entry.images || []).length < 2) console.log(`  note: "${entry.name}" has ${entry.images.length} image(s)`);
}

const header = `// Generated by tools/build-exercise-info.mjs. Do not edit by hand; re-run the script.
//
// How-to photos and instructions from free-exercise-db by yuhonas
// (https://github.com/yuhonas/free-exercise-db), released into the public domain (Unlicense).
// Keyed by exerciseKey(): "name|equipment". Image paths are relative to IMAGE_BASE.

export const IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

export const EXERCISE_INFO = `;

await writeFile(OUT, `${header}${JSON.stringify(info, null, 2)};\n`, "utf8");
console.log(`Wrote ${Object.keys(info).length} of ${EXERCISE_SEED.length} seed exercises to js/exercise-info.js`);
if (unmatched.length) console.log(`No match for:\n  ${unmatched.join("\n  ")}`);
