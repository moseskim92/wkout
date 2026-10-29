// LocalStore: the store interface on top of localStorage (see store.js for the contract).
// Used automatically when config.js has no Supabase settings. Data stays on this device.

import { EXERCISE_SEED } from "./exercises-seed.js";
import { seedMuscles } from "./exercises-seed.js";
import { byDateDesc, bySetOrder, cleanMuscles, cleanTags, groupSetsIntoSessions, normalizeWorkout } from "./store.js";

const KEY = "workout-tracker:db:v1";

function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for non-secure contexts (e.g. http://192.168.x.x on a phone).
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const now = () => new Date().toISOString();
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function seedRow(e, ts) {
  return {
    id: uuid(),
    name: e.name,
    equipment: e.equipment,
    muscle_group: e.muscle_group,
    muscles: [...e.primary],
    created_by: null,
    created_at: ts,
  };
}

/**
 * Bring data saved by an older version up to the current shape, in place.
 * Additive only: exercises gain `muscles`, workouts gain `tags`. Returns true if changed.
 */
function migrate(db) {
  let changed = false;
  for (const ex of db.exercises || []) {
    if (!Array.isArray(ex.muscles)) {
      ex.muscles = ex.created_by ? [] : seedMuscles(ex.name, ex.equipment);
      changed = true;
    }
  }
  for (const w of db.workouts || []) {
    if (!Array.isArray(w.tags)) {
      w.tags = [];
      changed = true;
    }
  }
  return changed;
}

export class LocalStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.mode = "local";
  }

  // ---- persistence -------------------------------------------------------------------

  _load() {
    let db = null;
    try {
      const raw = this.storage.getItem(KEY);
      if (raw) db = JSON.parse(raw);
    } catch {
      db = null;
    }
    if (!db || !Array.isArray(db.users)) {
      const ts = now();
      db = {
        users: [],
        exercises: EXERCISE_SEED.map((e) => seedRow(e, ts)),
        workouts: [],
        sets: [],
      };
      this._save(db);
    } else if (migrate(db)) {
      this._save(db);
    }
    return db;
  }

  _save(db) {
    try {
      this.storage.setItem(KEY, JSON.stringify(db));
    } catch (err) {
      throw new Error(`Could not save to this browser's storage: ${err.message}`);
    }
  }

  _joinWorkout(db, w) {
    const users = new Map(db.users.map((u) => [u.id, u]));
    const exercises = new Map(db.exercises.map((e) => [e.id, e]));
    const u = users.get(w.user_id);
    const sets = db.sets
      .filter((s) => s.workout_id === w.id)
      .map((s) => ({ ...s, exercise: exercises.get(s.exercise_id) || null }))
      .sort(bySetOrder);
    return normalizeWorkout(clone({ ...w, user: u ? { id: u.id, name: u.name } : null, sets }));
  }

  // ---- users -------------------------------------------------------------------------

  async getUsers() {
    const db = this._load();
    return clone(db.users).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createUser(name) {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Name can't be empty.");
    const db = this._load();
    if (db.users.some((u) => sameName(u.name, clean))) {
      throw new Error(`"${clean}" already exists. Pick it from the list instead.`);
    }
    const user = { id: uuid(), name: clean, created_at: now() };
    db.users.push(user);
    this._save(db);
    return clone(user);
  }

  // ---- exercises ---------------------------------------------------------------------

  async getExercises() {
    const db = this._load();
    return clone(db.exercises).sort(
      (a, b) => a.name.localeCompare(b.name) || a.equipment.localeCompare(b.equipment),
    );
  }

  async createExercise({ name, equipment, muscle_group, muscles = [], created_by = null }) {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Exercise name can't be empty.");
    const db = this._load();
    if (db.exercises.some((e) => sameName(e.name, clean) && e.equipment === equipment)) {
      throw new Error(`"${clean}" (${equipment}) already exists.`);
    }
    const ex = {
      id: uuid(),
      name: clean,
      equipment,
      muscle_group,
      muscles: cleanMuscles(muscles),
      created_by,
      created_at: now(),
    };
    db.exercises.push(ex);
    this._save(db);
    return clone(ex);
  }

  // ---- workouts ----------------------------------------------------------------------

  async getWorkouts({ userId, limit } = {}) {
    const db = this._load();
    let list = db.workouts.filter((w) => !userId || w.user_id === userId).sort(byDateDesc);
    if (limit) list = list.slice(0, limit);
    return list.map((w) => this._joinWorkout(db, w));
  }

  async getWorkoutByDate(userId, date) {
    const db = this._load();
    const w = db.workouts.find((x) => x.user_id === userId && x.date === date);
    return w ? this._joinWorkout(db, w) : null;
  }

  async createWorkout({ user_id, date, notes = null, tags = [] }) {
    const db = this._load();
    if (!db.users.some((u) => u.id === user_id)) throw new Error("Unknown user.");
    if (db.workouts.some((w) => w.user_id === user_id && w.date === date)) {
      throw new Error("A workout already exists for that date.");
    }
    const w = { id: uuid(), user_id, date, notes, tags: cleanTags(tags), created_at: now() };
    db.workouts.push(w);
    this._save(db);
    return this._joinWorkout(db, w);
  }

  async updateWorkout(id, patch) {
    const db = this._load();
    const w = db.workouts.find((x) => x.id === id);
    if (!w) throw new Error("Workout not found.");
    const { notes, date, tags } = patch;
    if (notes !== undefined) w.notes = notes;
    if (date !== undefined) w.date = date;
    if (tags !== undefined) w.tags = cleanTags(tags);
    this._save(db);
    return clone(w);
  }

  async deleteWorkout(id) {
    const db = this._load();
    db.workouts = db.workouts.filter((w) => w.id !== id);
    db.sets = db.sets.filter((s) => s.workout_id !== id); // cascade
    this._save(db);
  }

  // ---- sets --------------------------------------------------------------------------

  async addSet({ workout_id, exercise_id, set_order, reps = 0, weight_lb = 0, notes = null }) {
    const db = this._load();
    if (!db.workouts.some((w) => w.id === workout_id)) throw new Error("Workout not found.");
    const ex = db.exercises.find((e) => e.id === exercise_id);
    if (!ex) throw new Error("Exercise not found.");
    const s = {
      id: uuid(),
      workout_id,
      exercise_id,
      set_order: Number(set_order) || 0,
      reps: Number(reps) || 0,
      weight_lb: Number(weight_lb) || 0,
      notes,
      created_at: now(),
    };
    db.sets.push(s);
    this._save(db);
    return clone({ ...s, exercise: ex });
  }

  async updateSet(id, patch) {
    const db = this._load();
    const s = db.sets.find((x) => x.id === id);
    if (!s) throw new Error("Set not found.");
    for (const k of ["reps", "weight_lb", "set_order", "notes", "exercise_id"]) {
      if (patch[k] !== undefined) s[k] = patch[k];
    }
    this._save(db);
    const ex = db.exercises.find((e) => e.id === s.exercise_id) || null;
    return clone({ ...s, exercise: ex });
  }

  async deleteSet(id) {
    const db = this._load();
    db.sets = db.sets.filter((s) => s.id !== id);
    this._save(db);
  }

  // ---- history -----------------------------------------------------------------------

  _setRowsFor(db, userId, exerciseId) {
    const workouts = new Map(
      db.workouts.filter((w) => w.user_id === userId).map((w) => [w.id, w]),
    );
    const ex = db.exercises.find((e) => e.id === exerciseId) || null;
    return db.sets
      .filter((s) => s.exercise_id === exerciseId && workouts.has(s.workout_id))
      .map((s) => {
        const w = workouts.get(s.workout_id);
        return clone({ ...s, exercise: ex, workout: { id: w.id, date: w.date, user_id: w.user_id } });
      });
  }

  async getLastSetsForExercise(userId, exerciseId, beforeDate) {
    const db = this._load();
    const rows = this._setRowsFor(db, userId, exerciseId).filter((r) => r.workout.date < beforeDate);
    const sessions = groupSetsIntoSessions(rows);
    return sessions.length ? sessions[sessions.length - 1] : null;
  }

  async getExerciseHistory(userId, exerciseId) {
    const db = this._load();
    return groupSetsIntoSessions(this._setRowsFor(db, userId, exerciseId));
  }

  async getRecentActivity(limit = 30) {
    return this.getWorkouts({ limit });
  }
}
