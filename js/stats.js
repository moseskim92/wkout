// Pure workout math. No DOM, no storage; safe to import from Node for testing.

/** Estimated one-rep max (Epley): w * (1 + reps / 30). A single rep is the weight itself. */
export function epley1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (r <= 0 || w <= 0) return 0;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

/** True if set `a` beats set `b`: heavier, or same weight with more reps. */
export function isBetterSet(a, b) {
  if (!b) return Boolean(a);
  if (!a) return false;
  const aw = Number(a.weight_lb) || 0;
  const bw = Number(b.weight_lb) || 0;
  if (aw !== bw) return aw > bw;
  return (Number(a.reps) || 0) > (Number(b.reps) || 0);
}

/** The top set: heaviest weight, ties broken by reps. Sets with 0 reps are ignored. */
export function topSet(sets) {
  let best = null;
  for (const s of sets || []) {
    if ((Number(s.reps) || 0) <= 0) continue;
    if (isBetterSet(s, best)) best = s;
  }
  return best;
}

/** Total volume in lb (sum of weight * reps). */
export function volume(sets) {
  let v = 0;
  for (const s of sets || []) v += (Number(s.weight_lb) || 0) * (Number(s.reps) || 0);
  return v;
}

/** Best estimated 1RM across a list of sets. */
export function best1RM(sets) {
  let best = 0;
  for (const s of sets || []) best = Math.max(best, epley1RM(s.weight_lb, s.reps));
  return best;
}

/** Most reps in a single set (used for bodyweight-only movements). */
export function maxReps(sets) {
  let best = 0;
  for (const s of sets || []) best = Math.max(best, Number(s.reps) || 0);
  return best;
}

/**
 * Is the top set of `currentSets` a PR versus all earlier sessions?
 * `priorSessions` are sessions ({date, sets}) strictly before the current one.
 * The first ever session is not counted as a PR (there is nothing to beat).
 */
export function isPR(currentSets, priorSessions) {
  const current = topSet(currentSets);
  if (!current) return false;
  let prior = null;
  for (const session of priorSessions || []) {
    const t = topSet(session.sets);
    if (isBetterSet(t, prior)) prior = t;
  }
  if (!prior) return false;
  return isBetterSet(current, prior);
}

/** Group a workout's sets by exercise, preserving the order exercises first appear. */
export function groupByExercise(sets) {
  const groups = new Map();
  for (const s of sets || []) {
    let g = groups.get(s.exercise_id);
    if (!g) {
      g = { exercise_id: s.exercise_id, exercise: s.exercise, sets: [] };
      groups.set(s.exercise_id, g);
    }
    g.sets.push(s);
  }
  return [...groups.values()];
}

/**
 * Mark PRs across a list of workouts (any users, any order).
 * Returns a Set of keys `${workout_id}|${exercise_id}` whose top set beat every
 * earlier session of that user on that exercise.
 */
export function computePRKeys(workouts) {
  const ordered = [...(workouts || [])].sort(
    (a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      String(a.created_at).localeCompare(String(b.created_at)),
  );
  const bestByUserExercise = new Map();
  const keys = new Set();
  for (const w of ordered) {
    for (const g of groupByExercise(w.sets)) {
      const k = `${w.user_id}|${g.exercise_id}`;
      const t = topSet(g.sets);
      if (!t) continue;
      const prev = bestByUserExercise.get(k);
      if (prev && isBetterSet(t, prev)) keys.add(`${w.id}|${g.exercise_id}`);
      if (isBetterSet(t, prev)) bestByUserExercise.set(k, t);
    }
  }
  return keys;
}

/**
 * Per-session series for the Progress chart, from getExerciseHistory() output.
 * Returns [{date, topWeight, topReps, e1rm, maxReps, sets}], oldest first,
 * skipping sessions with no completed reps.
 */
export function sessionSeries(sessions) {
  const out = [];
  for (const s of sessions || []) {
    const t = topSet(s.sets);
    if (!t) continue;
    out.push({
      date: s.date,
      topWeight: Number(t.weight_lb) || 0,
      topReps: Number(t.reps) || 0,
      e1rm: best1RM(s.sets),
      maxReps: maxReps(s.sets),
      sets: s.sets,
    });
  }
  return out;
}

/** Summary stats for the Progress view. */
export function exerciseSummary(sessions) {
  let bestSet = null;
  let bestE1RM = 0;
  let count = 0;
  let last = null;
  for (const s of sessions || []) {
    const t = topSet(s.sets);
    if (!t) continue;
    count += 1;
    if (isBetterSet(t, bestSet)) bestSet = t;
    bestE1RM = Math.max(bestE1RM, best1RM(s.sets));
    if (!last || s.date > last) last = s.date;
  }
  return { bestSet, bestE1RM, sessions: count, lastDate: last };
}
