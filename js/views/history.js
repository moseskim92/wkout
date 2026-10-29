// History view: the current user's workouts, newest first. Filter by day tag, expand to
// see sets and a map of the muscles worked, "Edit" opens the date in the Log view,
// "Delete" removes the workout (sets cascade). Days with tags or notes but no sets
// (cardio, a session with a trainer) show up too.

import { bodyMap, combineMuscles } from "../bodymap.js";
import { musclesFor } from "../exercises-seed.js";
import { computePRKeys, groupByExercise, topSet, volume } from "../stats.js";
import { WORKOUT_TAGS, workoutHasContent } from "../store.js";
import {
  confirmDialog,
  exerciseLabel,
  fmtDate,
  fmtInt,
  fmtSet,
  h,
  prBadge,
  relativeDay,
  showError,
  tagList,
  tagToggle,
} from "../ui.js";

// Which cards are expanded, so a background refetch doesn't collapse them.
const openIds = new Set();
// Active tag filter (any of these tags). Kept while the app is open.
const activeTags = new Set();

export async function render(root, ctx) {
  const { store, state } = ctx;
  const workouts = await store.getWorkouts({ userId: state.me.id });
  if (!ctx.alive()) return;
  const prKeys = computePRKeys(workouts);
  const all = workouts.filter(workoutHasContent);

  if (!all.length) {
    root.replaceChildren(
      h("h2", { text: "History" }),
      h("p", { class: "empty", text: "No workouts yet. Log one from the Log tab." }),
    );
    return;
  }

  // Filter chips for the tags this person actually uses.
  const used = WORKOUT_TAGS.filter((t) => all.some((w) => w.tags.includes(t)));
  for (const t of [...activeTags]) if (!used.includes(t)) activeTags.delete(t);
  const filterBar = used.length
    ? h(
        "div",
        { class: "tag-row filter-bar", role: "group", "aria-label": "Filter by tag" },
        used.map((t) =>
          tagToggle(t, activeTags.has(t), () => {
            if (activeTags.has(t)) activeTags.delete(t);
            else activeTags.add(t);
            ctx.rerender();
          }),
        ),
        activeTags.size
          ? h("button", {
              type: "button",
              class: "link-btn muted small",
              text: "Clear",
              onclick: () => {
                activeTags.clear();
                ctx.rerender();
              },
            })
          : null,
      )
    : null;

  const visible = activeTags.size ? all.filter((w) => w.tags.some((t) => activeTags.has(t))) : all;

  const cards = visible.map((w) => {
    const groups = groupByExercise(w.sets);
    const prCount = groups.filter((g) => prKeys.has(`${w.id}|${g.exercise_id}`)).length;
    const statsText = w.sets.length
      ? `${groups.length} exercise${groups.length === 1 ? "" : "s"} · ${w.sets.length} set${w.sets.length === 1 ? "" : "s"} · ${fmtInt(volume(w.sets))} lb`
      : "No lifts logged";
    const summary = h(
      "summary",
      { class: "hist-summary" },
      h(
        "div",
        { class: "hist-main" },
        h("strong", { text: relativeDay(w.date) }),
        h("span", { class: "muted small stats-line", text: statsText }),
        tagList(w.tags),
      ),
      prCount ? h("span", { class: "row gap-sm" }, prBadge(), prCount > 1 ? h("span", { class: "small muted", text: `×${prCount}` }) : null) : null,
    );

    // Everything this day hit, on one map.
    let dayMap = null;
    if (groups.length) {
      const hit = combineMuscles(groups.map((g) => musclesFor(g.exercise)));
      if (hit.primary.length || hit.secondary.length) {
        dayMap = h(
          "div",
          { class: "day-muscles" },
          bodyMap({ ...hit, size: "md", captions: true }),
          h(
            "div",
            { class: "muscle-legend muscle-list" },
            h("p", { class: "field-label" }, h("span", { class: "legend-key primary" }), "Worked"),
            h("p", { class: "small", text: hit.primary.join(", ") || "–" }),
            hit.secondary.length ? h("p", { class: "field-label" }, h("span", { class: "legend-key secondary" }), "Also") : null,
            hit.secondary.length ? h("p", { class: "small muted", text: hit.secondary.join(", ") }) : null,
          ),
        );
      }
    }

    const body = h(
      "div",
      { class: "hist-body" },
      dayMap,
      groups.map((g) =>
        h(
          "div",
          { class: "hist-ex" },
          h("div", { class: "row gap-sm wrap" }, exerciseLabel(g.exercise), prKeys.has(`${w.id}|${g.exercise_id}`) ? prBadge() : null),
          h("p", { class: "small sets-line" }, g.sets.map(fmtSet).join(", "), h("span", { class: "muted" }, `  ·  top ${fmtSet(topSet(g.sets))}`)),
        ),
      ),
      (w.notes || "").trim() ? h("p", { class: "notes small", text: w.notes }) : null,
      h(
        "div",
        { class: "row gap end" },
        h("button", {
          type: "button",
          class: "btn ghost small",
          text: "Edit",
          onclick: () => ctx.go("log", { date: w.date }),
        }),
        h("button", {
          type: "button",
          class: "btn danger small",
          text: "Delete",
          onclick: async () => {
            const what = w.sets.length ? ` and all ${w.sets.length} set(s)` : "";
            const ok = await confirmDialog(`Delete the workout from ${fmtDate(w.date, { weekday: true })}${what}?`);
            if (!ok) return;
            try {
              await store.deleteWorkout(w.id);
            } catch (err) {
              showError(err);
            }
            ctx.rerender();
          },
        }),
      ),
    );

    const card = h("details", { class: "card hist-card", open: openIds.has(w.id) }, summary, body);
    card.addEventListener("toggle", () => (card.open ? openIds.add(w.id) : openIds.delete(w.id)));
    return card;
  });

  root.replaceChildren(
    h("h2", { text: "History" }),
    filterBar,
    ...(cards.length ? cards : [h("p", { class: "empty", text: `No days tagged ${[...activeTags].join(" or ")}.` })]),
  );
}
