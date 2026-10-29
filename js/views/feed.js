// Feed view: recent workouts from everyone, newest first, with each exercise's
// top set and PR badges. Tap a name to open that person's Progress.

import { computePRKeys, groupByExercise, topSet, volume } from "../stats.js";
import { workoutHasContent } from "../store.js";
import { exerciseLabel, fmtInt, fmtSet, h, prBadge, relativeDay, tagList } from "../ui.js";

const FEED_LIMIT = 30;

export async function render(root, ctx) {
  const { store, state } = ctx;
  // Recent items for display; the full list is only used to decide PRs fairly.
  const [recent, all] = await Promise.all([store.getRecentActivity(FEED_LIMIT), store.getWorkouts({})]);
  if (!ctx.alive()) return;
  const prKeys = computePRKeys(all);
  const items = recent.filter(workoutHasContent);

  if (!items.length) {
    root.replaceChildren(h("h2", { text: "Feed" }), h("p", { class: "empty", text: "No workouts from anyone yet." }));
    return;
  }

  const cards = items.map((w) => {
    const groups = groupByExercise(w.sets);
    const name = w.user?.name || "Someone";
    const isMe = w.user_id === state.me.id;
    return h(
      "article",
      { class: "card feed-card" },
      h(
        "div",
        { class: "feed-head" },
        h("button", {
          type: "button",
          class: "link-btn feed-name",
          text: isMe ? `${name} (you)` : name,
          title: `See ${name}'s progress`,
          onclick: () => ctx.go("progress", { userId: w.user_id }),
        }),
        h("span", { class: "muted small", text: relativeDay(w.date) }),
      ),
      tagList(w.tags),
      groups.length
        ? h(
            "ul",
            { class: "feed-list" },
            groups.map((g) =>
              h(
                "li",
                {},
                exerciseLabel(g.exercise),
                h("span", { class: "feed-top", text: fmtSet(topSet(g.sets)) || `${g.sets.length} sets` }),
                prKeys.has(`${w.id}|${g.exercise_id}`) ? prBadge() : null,
              ),
            ),
          )
        : h("p", { class: "muted small feed-empty", text: "No lifts logged" }),
      w.sets.length ? h("p", { class: "muted small", text: `${w.sets.length} sets · ${fmtInt(volume(w.sets))} lb volume` }) : null,
      (w.notes || "").trim() ? h("p", { class: "notes small", text: w.notes }) : null,
    );
  });

  root.replaceChildren(h("h2", { text: "Feed" }), ...cards);
}
