// Storage layer entry point.
//
// createStore() returns a SupabaseStore when config.js has a URL and key, otherwise
// a LocalStore backed by localStorage. Both implement the same async interface and
// return the same shapes, so the UI never knows which one it is talking to.
//
// Shapes
//   User      { id, name, created_at }
//   Exercise  { id, name, equipment, muscle_group, muscles: string[], created_by, created_at }
//             (muscles = body-map regions, see MUSCLES in exercises-seed.js)
//   Set       { id, workout_id, exercise_id, set_order, reps, weight_lb, notes, created_at,
//               exercise: Exercise }
//   Workout   { id, user_id, date: "YYYY-MM-DD", notes, tags: string[] (see WORKOUT_TAGS), created_at,
//               user: { id, name }, sets: Set[] (sorted by set_order) }
//   Session   { date, workout_id, sets: Set[] }   (one workout's sets for one exercise)
//
// Interface (every method returns a Promise)
//   mode                                         "local" | "supabase"
//   getUsers()                                   -> User[] sorted by name
//   createUser(name)                             -> User
//   getExercises()                               -> Exercise[] sorted by name, equipment
//   createExercise({name, equipment, muscle_group, muscles, created_by}) -> Exercise
//   getWorkouts({userId?, limit?})               -> Workout[] newest first
//   getWorkoutByDate(userId, date)               -> Workout | null
//   createWorkout({user_id, date, notes, tags})  -> Workout
//   updateWorkout(id, patch)                     -> Workout (without sets); patch: {notes?, date?, tags?}
//   deleteWorkout(id)                            -> void (sets cascade)
//   addSet({workout_id, exercise_id, set_order, reps, weight_lb, notes}) -> Set
//   updateSet(id, patch)                         -> Set
//   deleteSet(id)                                -> void
//   getLastSetsForExercise(userId, exerciseId, beforeDate) -> Session | null
//   getExerciseHistory(userId, exerciseId)       -> Session[] oldest first
//   getRecentActivity(limit)                     -> Workout[] newest first, all users

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";
import { MUSCLES } from "./exercises-seed.js";

/** Allowed day tags, in display order. Mirrored by the check constraint in schema.sql. */
export const WORKOUT_TAGS = ["push", "pull", "legs", "upper", "lower", "full body", "cardio", "trainer", "other"];

/** Keep only allowed tags, without duplicates, in WORKOUT_TAGS order. */
export function cleanTags(tags) {
  const set = new Set(Array.isArray(tags) ? tags.map((t) => String(t).trim().toLowerCase()) : []);
  return WORKOUT_TAGS.filter((t) => set.has(t));
}

/** Keep only known body-map regions, without duplicates, in MUSCLES order. */
export function cleanMuscles(muscles) {
  const set = new Set(Array.isArray(muscles) ? muscles.map((m) => String(m).trim().toLowerCase()) : []);
  return MUSCLES.filter((m) => set.has(m));
}

/** A workout worth keeping: it has sets, a note, or at least one tag. */
export function workoutHasContent(w) {
  return Boolean(w && ((w.sets && w.sets.length) || (w.notes || "").trim() || (w.tags && w.tags.length)));
}

export function hasSupabaseConfig() {
  return Boolean(String(SUPABASE_URL || "").trim() && String(SUPABASE_ANON_KEY || "").trim());
}

export async function createStore() {
  if (hasSupabaseConfig()) {
    const { SupabaseStore } = await import("./store-supabase.js");
    return new SupabaseStore(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim());
  }
  const { LocalStore } = await import("./store-local.js");
  return new LocalStore();
}

// ---- Shared helpers used by both adapters -------------------------------------------

export function normalizeSet(s) {
  if (!s) return s;
  return {
    ...s,
    set_order: Number(s.set_order) || 0,
    reps: Number(s.reps) || 0,
    weight_lb: Number(s.weight_lb) || 0,
  };
}

export function normalizeWorkout(w) {
  if (!w) return w;
  const sets = Array.isArray(w.sets) ? w.sets.map(normalizeSet) : [];
  sets.sort(bySetOrder);
  return { ...w, tags: cleanTags(w.tags), sets };
}

export function bySetOrder(a, b) {
  return a.set_order - b.set_order || String(a.created_at).localeCompare(String(b.created_at));
}

export function byDateDesc(a, b) {
  return (
    String(b.date).localeCompare(String(a.date)) ||
    String(b.created_at).localeCompare(String(a.created_at))
  );
}

/**
 * Group flat set rows (each carrying `workout: {id, date}`) into sessions, oldest first.
 * The embedded `workout` object is removed from the returned sets.
 */
export function groupSetsIntoSessions(rows) {
  const byWorkout = new Map();
  for (const row of rows) {
    const { workout, ...set } = row;
    if (!workout) continue;
    let session = byWorkout.get(workout.id);
    if (!session) {
      session = { date: workout.date, workout_id: workout.id, sets: [] };
      byWorkout.set(workout.id, session);
    }
    session.sets.push(normalizeSet(set));
  }
  const sessions = [...byWorkout.values()];
  for (const s of sessions) s.sets.sort(bySetOrder);
  sessions.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return sessions;
}
