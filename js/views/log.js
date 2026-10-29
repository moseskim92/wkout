// Log view: today's (or any date's) workout for the current user.
// The workout row is created lazily when the first set, a note, or a day tag is added,
// and removed again once it has no sets, no note and no tags.

import { bodyMap } from "../bodymap.js";
import { openExerciseDetail } from "../detail.js";
import { musclesFor } from "../exercises-seed.js";
import { pickExercise } from "../picker.js";
import { cleanTags, WORKOUT_TAGS, workoutHasContent } from "../store.js";
import { groupByExercise, isPR, volume } from "../stats.js";
import {
  confirmDialog,
  exerciseLabel,
  fmtDate,
  fmtInt,
  fmtSet,
  fmtWeight,
  h,
  prBadge,
  relativeDay,
  showError,
  tagToggle,
  todayISO,
  toast,
} from "../ui.js";

// Per-exercise "last time" + prior history, cached between in-view refreshes.
const extrasCache = new Map();
// All writes go through one queue so edits, "+ set" and deletes apply in order.
let chain = Promise.resolve();
function enqueue(fn) {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

export async function render(root, ctx) {
  extrasCache.clear(); // tab activation / refocus: fetch fresh
  await draw(root, ctx);
}

async function loadExtras(store, userId, exerciseId, date) {
  const key = `${userId}|${exerciseId}|${date}`;
  if (!extrasCache.has(key)) {
    const p = Promise.all([
      store.getLastSetsForExercise(userId, exerciseId, date),
      store.getExerciseHistory(userId, exerciseId),
    ]).then(([last, history]) => ({ last, prior: history.filter((s) => s.date < date) }));
    extrasCache.set(key, p);
    p.catch(() => extrasCache.delete(key));
  }
  return extrasCache.get(key);
}

async function draw(root, ctx) {
  const { store, state } = ctx;
  const me = state.me;
  if (!state.logDate) state.logDate = todayISO();
  const date = state.logDate;

  await chain; // let pending writes land before reading
  const workout = await store.getWorkoutByDate(me.id, date);
  const groups = groupByExercise(workout?.sets || []);
  const extras = await Promise.all(groups.map((g) => loadExtras(store, me.id, g.exercise_id, date)));
  if (!ctx.alive()) return;

  const refresh = () => {
    if (ctx.alive()) return draw(root, ctx).catch(showError);
  };

  // ---- date bar ----
  const dateInput = h("input", {
    type: "date",
    id: "log-date",
    value: date,
    "aria-label": "Workout date",
    onchange: (e) => {
      if (!e.target.value) return;
      state.logDate = e.target.value;
      extrasCache.clear();
      refresh();
    },
  });
  const isToday = date === todayISO();
  const dateBar = h(
    "div",
    { class: "date-bar" },
    h("div", { class: "date-title" }, h("h2", { text: relativeDay(date) }), relativeDay(date) === "Yesterday" && h("span", { class: "muted small", text: fmtDate(date, { weekday: true }) })),
    h(
      "div",
      { class: "row gap" },
      dateInput,
      !isToday &&
        h("button", {
          type: "button",
          class: "btn ghost small",
          text: "Today",
          onclick: () => {
            state.logDate = todayISO();
            refresh();
          },
        }),
    ),
  );

  // ---- day tags ----
  const tags = workout?.tags || [];
  const tagRow = h(
    "div",
    { class: "tag-row day-tags", role: "group", "aria-label": "Tag this day" },
    WORKOUT_TAGS.map((t) =>
      tagToggle(t, tags.includes(t), async (e) => {
        const on = !tags.includes(t);
        const next = on ? [...tags, t] : tags.filter((x) => x !== t);
        e.currentTarget.classList.toggle("on", on); // instant feedback; refresh repaints
        try {
          await enqueue(async () => {
            if (next.length) {
              const w = workout || (await ensureWorkout(store, me.id, date, { tags: next }));
              if (cleanTags(w.tags).join() !== cleanTags(next).join()) await store.updateWorkout(w.id, { tags: next });
            } else if (workout) {
              await store.updateWorkout(workout.id, { tags: [] });
              await pruneIfEmpty(store, me.id, date);
            }
          });
        } catch (err) {
          showError(err);
        }
        refresh();
      }),
    ),
  );

  const allSets = workout?.sets || [];
  const summary = allSets.length
    ? h(
        "p",
        { class: "muted small summary" },
        `${groups.length} exercise${groups.length === 1 ? "" : "s"} · ${allSets.length} set${allSets.length === 1 ? "" : "s"} · ${fmtInt(volume(allSets))} lb volume`,
      )
    : workout
      ? h("p", { class: "muted empty-hint", text: "No lifts logged for this day. Tags and notes still save it (handy for cardio)." })
      : h("p", { class: "muted empty-hint", text: "Nothing logged for this day yet. Add an exercise or tag the day to start." });

  // ---- exercise blocks ----
  const maxOrder = () => (workout?.sets || []).reduce((m, s) => Math.max(m, s.set_order), 0);

  const blocks = groups.map((g, gi) => {
    const ex = g.exercise;
    const { last, prior } = extras[gi];
    const prSlot = h("span", { class: "pr-slot" });
    const paintPR = () => prSlot.replaceChildren(isPR(g.sets, prior) ? prBadge() : "");
    paintPR();

    const lastLine = last
      ? h("p", { class: "last-time" }, `Last time: ${last.sets.map(fmtSet).join(", ")} (${fmtDate(last.date)})`)
      : h("p", { class: "last-time", text: "First time logging this one." });

    const rows = g.sets.map((set, i) => {
      const wIn = h("input", {
        type: "text",
        inputmode: "decimal",
        pattern: "[0-9]*[.,]?[0-9]*",
        enterkeyhint: "next",
        class: "num",
        value: set.weight_lb ? fmtWeight(set.weight_lb) : "",
        placeholder: ex?.equipment === "bodyweight" ? "BW" : "0",
        "aria-label": `Set ${i + 1} weight in pounds`,
      });
      const rIn = h("input", {
        type: "text",
        inputmode: "numeric",
        pattern: "[0-9]*",
        enterkeyhint: "done",
        class: "num",
        value: set.reps ? String(set.reps) : "",
        placeholder: "0",
        "aria-label": `Set ${i + 1} reps`,
      });
      const select = (e) => e.target.select();
      wIn.addEventListener("focus", select);
      rIn.addEventListener("focus", select);

      const save = (input, field, parse, display) => async () => {
        const raw = input.value.trim().replace(",", ".");
        const v = raw === "" ? 0 : parse(raw);
        if (!Number.isFinite(v) || v < 0 || v > 5000) {
          toast(field === "reps" ? "Reps must be a whole number." : "Weight must be a number of pounds.");
          input.value = display(set[field]);
          return;
        }
        if (v === set[field]) {
          input.value = display(v);
          return;
        }
        const before = set[field];
        set[field] = v; // optimistic, so "+ set" copies what you see
        input.value = display(v);
        try {
          const updated = await enqueue(() => store.updateSet(set.id, { [field]: v }));
          set[field] = updated[field];
          input.classList.add("saved");
          setTimeout(() => input.classList.remove("saved"), 700);
          paintPR();
        } catch (err) {
          set[field] = before;
          input.value = display(before);
          showError(err);
        }
      };
      wIn.addEventListener(
        "change",
        save(wIn, "weight_lb", (r) => Math.round(Number(r) * 100) / 100, (v) => (v ? fmtWeight(v) : "")),
      );
      rIn.addEventListener(
        "change",
        save(rIn, "reps", (r) => (/^\d+$/.test(r) ? Number(r) : NaN), (v) => (v ? String(v) : "")),
      );

      return h(
        "div",
        { class: "set-row" },
        h("span", { class: "set-num", text: String(i + 1) }),
        wIn,
        rIn,
        h("button", {
          type: "button",
          class: "icon-btn del",
          "aria-label": `Delete set ${i + 1}`,
          title: "Delete set",
          text: "✕",
          onclick: async () => {
            try {
              await enqueue(async () => {
                await store.deleteSet(set.id);
                // Drop the workout only if nothing is left: no sets, no note, no tags.
                await pruneIfEmpty(store, me.id, date);
              });
            } catch (err) {
              showError(err);
            }
            refresh();
          },
        }),
      );
    });

    const thumb = ex
      ? h(
          "button",
          {
            type: "button",
            class: "ex-thumb",
            "aria-label": `Muscles and how-to for ${ex.name}`,
            title: "Muscles and how-to",
            onclick: () => openExerciseDetail(ex),
          },
          bodyMap({ ...musclesFor(ex), view: "auto", size: "sm" }),
        )
      : null;

    return h(
      "section",
      { class: `card ex-block equip-${ex?.equipment || "other"}`, dataset: { exerciseId: g.exercise_id } },
      h(
        "div",
        { class: "ex-head" },
        thumb,
        h("div", { class: "ex-title" }, exerciseLabel(ex), prSlot),
        h("button", {
          type: "button",
          class: "link-btn muted small remove",
          "aria-label": `Remove ${ex?.name || "exercise"} from this workout`,
          title: "Remove exercise",
          text: "Remove",
          onclick: async () => {
            const ok = await confirmDialog(`Remove ${ex?.name || "this exercise"} and its ${g.sets.length} set(s) from this workout?`, {
              okLabel: "Remove",
            });
            if (!ok) return;
            try {
              await enqueue(async () => {
                for (const s of g.sets) await store.deleteSet(s.id);
                await pruneIfEmpty(store, me.id, date);
              });
            } catch (err) {
              showError(err);
            }
            refresh();
          },
        }),
        lastLine,
      ),
      h(
        "div",
        { class: "set-table" },
        h("div", { class: "set-row head", "aria-hidden": "true" }, h("span", { text: "Set" }), h("span", { text: "lb" }), h("span", { text: "Reps" }), h("span")),
        rows,
      ),
      h("button", {
        type: "button",
        class: "btn ghost small add-set",
        text: "+ set",
        onclick: async () => {
          try {
            await enqueue(() => {
              const prev = g.sets[g.sets.length - 1];
              return store.addSet({
                workout_id: workout.id,
                exercise_id: g.exercise_id,
                set_order: maxOrder() + 1,
                reps: prev ? prev.reps : 0,
                weight_lb: prev ? prev.weight_lb : 0,
                notes: null,
              });
            });
          } catch (err) {
            showError(err);
          }
          refresh();
        },
      }),
    );
  });

  // ---- add exercise ----
  const addBtn = h("button", {
    type: "button",
    class: "btn primary block",
    text: "+ Add exercise",
    onclick: async () => {
      const ex = await pickExercise(ctx);
      if (!ex) return;
      try {
        await enqueue(async () => {
          const w = workout || (await ensureWorkout(store, me.id, date));
          const existing = groups.find((g) => g.exercise_id === ex.id);
          let template = existing ? existing.sets[existing.sets.length - 1] : null;
          if (!template) {
            const last = await store.getLastSetsForExercise(me.id, ex.id, date);
            template = last?.sets[0] || null;
          }
          await store.addSet({
            workout_id: w.id,
            exercise_id: ex.id,
            set_order: (w.sets || []).reduce((m, s) => Math.max(m, s.set_order), 0) + 1,
            reps: template ? template.reps : 0,
            weight_lb: template ? template.weight_lb : 0,
            notes: null,
          });
        });
      } catch (err) {
        showError(err);
      }
      refresh();
    },
  });

  // ---- notes ----
  const notes = h("textarea", {
    id: "workout-notes",
    rows: 2,
    placeholder: "Notes (optional): how it felt, gym, etc.",
    value: workout?.notes || "",
  });
  notes.addEventListener("change", async () => {
    const text = notes.value.trim();
    let structural = false; // workout created or removed: redraw
    try {
      await enqueue(async () => {
        if (workout) {
          await store.updateWorkout(workout.id, { notes: text || null });
          if (!text) structural = await pruneIfEmpty(store, me.id, date);
        } else if (text) {
          const w = await ensureWorkout(store, me.id, date);
          await store.updateWorkout(w.id, { notes: text });
          structural = true;
        }
      });
      if (structural) refresh();
    } catch (err) {
      showError(err);
    }
  });

  root.replaceChildren(
    dateBar,
    tagRow,
    summary,
    ...blocks,
    addBtn,
    h("label", { class: "section-title", for: "workout-notes", text: "Workout notes" }),
    notes,
  );
}

/** Delete this day's workout if it has no sets, no note and no tags. Returns true if deleted. */
async function pruneIfEmpty(store, userId, date) {
  const w = await store.getWorkoutByDate(userId, date);
  if (w && !workoutHasContent(w)) {
    await store.deleteWorkout(w.id);
    return true;
  }
  return false;
}

async function ensureWorkout(store, userId, date, { tags = [] } = {}) {
  const existing = await store.getWorkoutByDate(userId, date);
  if (existing) return existing;
  try {
    return await store.createWorkout({ user_id: userId, date, notes: null, tags });
  } catch (err) {
    // Another device may have created it a moment ago (unique user+date).
    const again = await store.getWorkoutByDate(userId, date);
    if (again) return again;
    throw err;
  }
}
