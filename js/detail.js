// Exercise detail sheet: step photos, muscle map, numbered instructions, and links to
// short form videos. Opened by tapping an exercise name anywhere in the app.
//
// Photos and instructions come from js/exercise-info.js (generated from the public-domain
// free-exercise-db by tools/build-exercise-info.mjs) and are loaded on first open.
// Custom exercises have no entry there; the sheet then shows the map and links only.

import { bodyMap } from "./bodymap.js";
import { exerciseKey, musclesFor } from "./exercises-seed.js";
import { equipBadge, h, icon, isBackdropClick } from "./ui.js";

let infoModule = null;
function loadInfo() {
  if (!infoModule) {
    infoModule = import("./exercise-info.js").catch((err) => {
      infoModule = null;
      throw err;
    });
  }
  return infoModule;
}

export function youtubeShortsUrl(ex) {
  const q = `${ex.name} ${ex.equipment} form #shorts`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

export function tiktokUrl(ex) {
  return `https://www.tiktok.com/search?q=${encodeURIComponent(`${ex.name} form`)}`;
}

function placeholder(text) {
  return h("div", { class: "photo missing" }, icon("photo"), h("span", { text }));
}

function photo(src, caption, alt) {
  const img = h("img", {
    src,
    alt,
    loading: "lazy",
    decoding: "async",
    width: 850,
    height: 567,
    referrerpolicy: "no-referrer",
  });
  const fig = h("figure", { class: "photo" }, img, h("figcaption", { text: caption }));
  img.addEventListener("error", () => fig.replaceWith(placeholder("Photo didn't load")));
  return fig;
}

function muscleBadges(list, kind) {
  return list.map((m) => h("span", { class: `badge muscle${kind === "secondary" ? " secondary" : ""}`, text: m }));
}

/** Open the detail sheet for an exercise row ({ name, equipment, muscles? }). */
export async function openExerciseDetail(ex) {
  if (!ex) return;
  let info = null;
  let base = "";
  try {
    const mod = await loadInfo();
    info = mod.EXERCISE_INFO[exerciseKey(ex)] || null;
    base = mod.IMAGE_BASE;
  } catch (err) {
    console.warn("Could not load exercise info", err);
  }

  const { primary, secondary } = musclesFor(ex);

  const photos = h(
    "div",
    { class: "photos" },
    info && info.images.length
      ? info.images.map((p, i) => photo(base + p, i === 0 ? "Start" : "Finish", `${ex.name}, ${i === 0 ? "start" : "finish"} position`))
      : [placeholder("No photo for this exercise"), placeholder("Try the video links below")],
  );

  const legend = h(
    "div",
    { class: "muscle-legend" },
    primary.length
      ? h(
          "div",
          {},
          h("p", { class: "field-label" }, h("span", { class: "legend-key primary" }), "Main muscles"),
          h("div", { class: "tags-inline" }, muscleBadges(primary, "primary")),
        )
      : h("p", { class: "muted small", text: "No muscles set for this exercise." }),
    secondary.length
      ? h(
          "div",
          {},
          h("p", { class: "field-label" }, h("span", { class: "legend-key secondary" }), "Also works"),
          h("div", { class: "tags-inline" }, muscleBadges(secondary, "secondary")),
        )
      : null,
  );

  const steps =
    info && info.instructions.length
      ? h(
          "section",
          {},
          h("h3", { class: "section-title detail-section-title", text: "How to do it" }),
          h("ol", { class: "detail-steps" }, info.instructions.map((t) => h("li", {}, h("span", { text: t })))),
        )
      : null;

  const links = h(
    "section",
    {},
    h("h3", { class: "section-title detail-section-title", text: "Watch form videos" }),
    h(
      "div",
      { class: "video-links" },
      h("a", { class: "btn", href: youtubeShortsUrl(ex), target: "_blank", rel: "noopener" }, icon("play"), "YouTube Shorts"),
      h("a", { class: "btn", href: tiktokUrl(ex), target: "_blank", rel: "noopener" }, icon("note"), "TikTok"),
    ),
  );

  const credit = info
    ? h(
        "p",
        { class: "credit" },
        `Photos and steps: “${info.source}” from `,
        h("a", { href: "https://github.com/yuhonas/free-exercise-db", target: "_blank", rel: "noopener", text: "free-exercise-db" }),
        " (public domain).",
      )
    : null;

  const dlg = h(
    "dialog",
    { class: "sheet detail", "aria-label": `${ex.name} (${ex.equipment})` },
    h(
      "div",
      { class: "sheet-head" },
      h("h2", { text: ex.name }),
      h("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: () => dlg.close() }, icon("close")),
    ),
    h("div", { class: "detail-badges" }, equipBadge(ex.equipment)),
    photos,
    h("div", { class: "detail-muscles" }, bodyMap({ primary, secondary, size: "md", captions: true }), legend),
    steps,
    links,
    credit,
  );
  dlg.addEventListener("click", (e) => {
    if (isBackdropClick(e, dlg)) dlg.close();
  });
  dlg.addEventListener("close", () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  // Start at the top, and keep focus off the links so the keyboard doesn't pop a tooltip.
  dlg.scrollTop = 0;
  dlg.querySelector(".icon-btn")?.focus();
}
