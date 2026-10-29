// SupabaseStore: the store interface on top of Supabase (see store.js for the contract).
// Talks to the tables created by schema.sql using the public anon key; access is
// governed by the RLS policies in schema.sql.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  byDateDesc,
  bySetOrder,
  cleanMuscles,
  cleanTags,
  groupSetsIntoSessions,
  normalizeSet,
  normalizeWorkout,
} from "./store.js";

// One request loads a workout with its owner and its sets (each joined to its exercise).
const WORKOUT_SELECT = "*, user:users(id, name), sets(*, exercise:exercises(*))";
const SET_SELECT = "*, exercise:exercises(*)";
// For per-exercise history: sets joined (inner) to their workout so we can filter by user/date.
const SET_HISTORY_SELECT = "*, exercise:exercises(*), workout:workouts!inner(id, date, user_id)";

function friendlyError(error) {
  const msg = error?.message || String(error);
  switch (error?.code) {
    case "23505":
      return "That already exists (names must be unique).";
    case "23503":
      return "That item is still referenced by logged sets, so it can't be removed.";
    case "23514":
      return "That value isn't allowed (check the numbers).";
    case "42P01":
      return "Database tables are missing. Run schema.sql in the Supabase SQL Editor.";
    case "42501":
      return "Permission denied by the database. Re-run schema.sql to restore the access policies.";
    default:
      if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
        return "Can't reach Supabase. Check your connection (or whether the project is paused).";
      }
      return msg;
  }
}

function unwrap({ data, error }) {
  if (error) {
    const err = new Error(friendlyError(error));
    err.cause = error;
    throw err;
  }
  return data;
}

export class SupabaseStore {
  constructor(url, anonKey) {
    this.mode = "supabase";
    this.db = createClient(url, anonKey, {
      // No Supabase Auth is used: identity is "pick your name".
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  // ---- users -------------------------------------------------------------------------

  async getUsers() {
    return unwrap(await this.db.from("users").select("*").order("name", { ascending: true }));
  }

  async createUser(name) {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Name can't be empty.");
    return unwrap(await this.db.from("users").insert({ name: clean }).select().single());
  }

  // ---- exercises ---------------------------------------------------------------------

  async getExercises() {
    const rows = unwrap(
      await this.db
        .from("exercises")
        .select("*")
        .order("name", { ascending: true })
        .order("equipment", { ascending: true }),
    );
    return (rows || []).map((e) => ({ ...e, muscles: Array.isArray(e.muscles) ? e.muscles : [] }));
  }

  async createExercise({ name, equipment, muscle_group, muscles = [], created_by = null }) {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Exercise name can't be empty.");
    return unwrap(
      await this.db
        .from("exercises")
        .insert({ name: clean, equipment, muscle_group, muscles: cleanMuscles(muscles), created_by })
        .select()
        .single(),
    );
  }

  // ---- workouts ----------------------------------------------------------------------

  async getWorkouts({ userId, limit } = {}) {
    let q = this.db.from("workouts").select(WORKOUT_SELECT);
    if (userId) q = q.eq("user_id", userId);
    q = q
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("set_order", { referencedTable: "sets", ascending: true });
    if (limit) q = q.limit(limit);
    const rows = unwrap(await q) || [];
    return rows.map(normalizeWorkout).sort(byDateDesc);
  }

  async getWorkoutByDate(userId, date) {
    const row = unwrap(
      await this.db
        .from("workouts")
        .select(WORKOUT_SELECT)
        .eq("user_id", userId)
        .eq("date", date)
        .order("set_order", { referencedTable: "sets", ascending: true })
        .maybeSingle(),
    );
    return row ? normalizeWorkout(row) : null;
  }

  async createWorkout({ user_id, date, notes = null, tags = [] }) {
    const row = unwrap(
      await this.db
        .from("workouts")
        .insert({ user_id, date, notes, tags: cleanTags(tags) })
        .select(WORKOUT_SELECT)
        .single(),
    );
    return normalizeWorkout(row);
  }

  async updateWorkout(id, patch) {
    const clean = {};
    if (patch.notes !== undefined) clean.notes = patch.notes;
    if (patch.date !== undefined) clean.date = patch.date;
    if (patch.tags !== undefined) clean.tags = cleanTags(patch.tags);
    const row = unwrap(await this.db.from("workouts").update(clean).eq("id", id).select().single());
    return { ...row, tags: cleanTags(row.tags) };
  }

  async deleteWorkout(id) {
    unwrap(await this.db.from("workouts").delete().eq("id", id));
  }

  // ---- sets --------------------------------------------------------------------------

  async addSet({ workout_id, exercise_id, set_order, reps = 0, weight_lb = 0, notes = null }) {
    const row = unwrap(
      await this.db
        .from("sets")
        .insert({ workout_id, exercise_id, set_order, reps, weight_lb, notes })
        .select(SET_SELECT)
        .single(),
    );
    return normalizeSet(row);
  }

  async updateSet(id, patch) {
    const clean = {};
    for (const k of ["reps", "weight_lb", "set_order", "notes", "exercise_id"]) {
      if (patch[k] !== undefined) clean[k] = patch[k];
    }
    const row = unwrap(await this.db.from("sets").update(clean).eq("id", id).select(SET_SELECT).single());
    return normalizeSet(row);
  }

  async deleteSet(id) {
    unwrap(await this.db.from("sets").delete().eq("id", id));
  }

  // ---- history -----------------------------------------------------------------------

  async getLastSetsForExercise(userId, exerciseId, beforeDate) {
    const rows = unwrap(
      await this.db
        .from("sets")
        .select(SET_HISTORY_SELECT)
        .eq("exercise_id", exerciseId)
        .eq("workout.user_id", userId)
        .lt("workout.date", beforeDate)
        .order("set_order", { ascending: true }),
    );
    const sessions = groupSetsIntoSessions(rows || []);
    return sessions.length ? sessions[sessions.length - 1] : null;
  }

  async getExerciseHistory(userId, exerciseId) {
    const rows = unwrap(
      await this.db
        .from("sets")
        .select(SET_HISTORY_SELECT)
        .eq("exercise_id", exerciseId)
        .eq("workout.user_id", userId)
        .order("set_order", { ascending: true }),
    );
    const sessions = groupSetsIntoSessions(rows || []);
    for (const s of sessions) s.sets.sort(bySetOrder);
    return sessions;
  }

  async getRecentActivity(limit = 30) {
    return this.getWorkouts({ limit });
  }
}
