// Progress view: per-exercise chart (top-set weight + estimated 1RM per session),
// stats row, and a data table twin. A user switcher lets you look at a friend's
// progress (read-only).

import { renderLineChart } from "../chart.js";
import { exerciseSummary, sessionSeries } from "../stats.js";
import { cap, equipBadge, exerciseNameButton, fmtDate, fmtSet, fmtWeight, h } from "../ui.js";

export async function render(root, ctx) {
  const { store, state } = ctx;
  const users = await ctx.refreshUsers();
  if (!users.some((u) => u.id === state.progressUserId)) state.progressUserId = state.me.id;
  const userId = state.progressUserId;
  const viewed = users.find((u) => u.id === userId) || state.me;

  const workouts = await store.getWorkouts({ userId });
  // Exercises this user has logged, most recently done first.
  const logged = new Map();
  for (const w of workouts) {
    for (const s of w.sets) {
      if (!s.exercise) continue;
      const cur = logged.get(s.exercise_id);
      if (!cur || w.date > cur.lastDate) logged.set(s.exercise_id, { exercise: s.exercise, lastDate: w.date });
    }
  }
  const options = [...logged.values()].sort(
    (a, b) => b.lastDate.localeCompare(a.lastDate) || a.exercise.name.localeCompare(b.exercise.name),
  );
  if (!logged.has(state.progressExerciseId)) state.progressExerciseId = options[0]?.exercise.id || null;
  const exId = state.progressExerciseId;
  const history = exId ? await store.getExerciseHistory(userId, exId) : [];
  if (!ctx.alive()) return;

  // ---- controls ----
  const userSel = h(
    "select",
    {
      id: "progress-user",
      onchange: (e) => {
        state.progressUserId = e.target.value;
        state.progressExerciseId = null;
        ctx.rerender();
      },
    },
    users.map((u) => h("option", { value: u.id, text: u.id === state.me.id ? `${u.name} (you)` : u.name, selected: u.id === userId })),
  );
  const exSel = h(
    "select",
    {
      id: "progress-exercise",
      disabled: !options.length,
      onchange: (e) => {
        state.progressExerciseId = e.target.value;
        ctx.rerender();
      },
    },
    options.length
      ? options.map(({ exercise: ex }) =>
          h("option", { value: ex.id, text: `${ex.name} (${ex.equipment})`, selected: ex.id === exId }),
        )
      : h("option", { text: "No exercises logged yet" }),
  );
  const controls = h(
    "div",
    { class: "filters" },
    h("label", { class: "field" }, h("span", { class: "field-label", text: "Person" }), userSel),
    h("label", { class: "field grow" }, h("span", { class: "field-label", text: "Exercise" }), exSel),
  );

  const header = h(
    "div",
    { class: "row between wrap gap-sm" },
    h("h2", { text: "Progress" }),
    viewed.id !== state.me.id ? h("span", { class: "badge neutral", text: `Viewing ${viewed.name} · read-only` }) : null,
  );

  if (!exId) {
    root.replaceChildren(
      header,
      controls,
      h("p", {
        class: "empty",
        text: viewed.id === state.me.id ? "Log a workout to see your progress here." : `${viewed.name} hasn't logged anything yet.`,
      }),
    );
    return;
  }

  const exercise = logged.get(exId).exercise;
  const series = sessionSeries(history);
  const summary = exerciseSummary(history);
  const bodyweightOnly = series.length > 0 && series.every((r) => r.topWeight === 0);

  // ---- stats row ----
  const tile = (label, value, sub) =>
    h("div", { class: "stat" }, h("span", { class: "stat-label", text: label }), h("span", { class: "stat-value", text: value }), sub ? h("span", { class: "stat-sub muted", text: sub }) : null);
  const stats = h(
    "div",
    { class: "stats" },
    tile("Best set", summary.bestSet ? fmtSet(summary.bestSet) : "–", summary.bestSet && summary.bestSet.weight_lb ? "lb × reps" : null),
    bodyweightOnly
      ? tile("Most reps", String(Math.max(0, ...series.map((r) => r.maxReps))), "in one set")
      : tile("Best est. 1RM", summary.bestE1RM ? `${fmtWeight(Math.round(summary.bestE1RM * 10) / 10)} lb` : "–", "Epley"),
    tile("Sessions", String(summary.sessions)),
    tile("Last done", summary.lastDate ? fmtDate(summary.lastDate) : "–"),
  );

  // ---- chart ----
  const chartTitle = h(
    "div",
    { class: "chart-title" },
    exerciseNameButton(exercise),
    equipBadge(exercise.equipment),
    h("span", { class: "muted small", text: bodyweightOnly ? " · most reps per session" : " · per session, lb" }),
  );
  const chartBox = h("div", { class: "chart-box" });
  const note =
    series.length === 1 ? h("p", { class: "muted small", text: "Only one session so far. Log it again to see a trend." }) : null;

  // ---- table twin ----
  const table = h(
    "details",
    { class: "table-twin" },
    h("summary", { text: "Show data table" }),
    h(
      "div",
      { class: "table-scroll" },
      h(
        "table",
        {},
        h(
          "thead",
          {},
          h("tr", {}, h("th", { text: "Date" }), h("th", { text: "Top set" }), h("th", { text: "Est. 1RM" }), h("th", { text: "Sets" })),
        ),
        h(
          "tbody",
          {},
          [...series].reverse().map((r) =>
            h(
              "tr",
              {},
              h("td", { text: fmtDate(r.date) }),
              h("td", { class: "num", text: r.topWeight ? `${fmtWeight(r.topWeight)}×${r.topReps}` : `${r.topReps} reps` }),
              h("td", { class: "num", text: r.e1rm ? fmtWeight(Math.round(r.e1rm * 10) / 10) : "–" }),
              h("td", { class: "small", text: r.sets.map(fmtSet).join(", ") }),
            ),
          ),
        ),
      ),
    ),
  );

  root.replaceChildren(header, controls, stats, h("section", { class: "card" }, chartTitle, chartBox, note, table));

  if (series.length) {
    const rows = series.map((r) => ({
      date: r.date,
      top: r.topWeight,
      e1rm: Math.round(r.e1rm * 10) / 10,
      reps: r.maxReps,
      detail: `Sets: ${r.sets.map(fmtSet).join(", ")}`,
    }));
    renderLineChart(chartBox, {
      rows,
      series: bodyweightOnly
        ? [{ key: "reps", name: "Most reps", color: "--series-1" }]
        : [
            { key: "top", name: "Top set weight", color: "--series-1" },
            { key: "e1rm", name: "Est. 1RM", color: "--series-2" },
          ],
      format: bodyweightOnly ? (v) => `${Math.round(v)} reps` : (v) => `${fmtWeight(v)} lb`,
      label: `${cap(viewed.name)}'s ${exercise.name} (${exercise.equipment}) progress: ${series.length} sessions, latest top set ${fmtSet({ weight_lb: series.at(-1).topWeight, reps: series.at(-1).topReps })}.`,
    });
  }
}
