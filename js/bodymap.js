// Inline SVG body map: front and back silhouettes with one path group per muscle region.
//
//   bodyMap({ primary: ["chest"], secondary: ["triceps"], view: "both" | "front" | "back" | "auto",
//             size: "sm" | "md" | "lg", label, onToggle })
//
// Regions are drawn for the figure's left half (x < 50 in a 100 x 200 box) and mirrored,
// so both sides always match. Primary muscles fill with --hit, secondary with --hit-2,
// the rest with --muscle; the silhouette uses --body. All colors are CSS tokens (styles.css),
// so the map follows light and dark mode. Pass onToggle(region) to make regions clickable.

import { MUSCLES } from "./exercises-seed.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Silhouette pieces (left half; mirrored). Drawn under the muscle regions.
const BODY_HALF = [
  // torso, shoulder to hip
  "M50 30 L44 30 C40 33 33 33 28 35 C23 37 21 42 21 48 L24 62 L29 76 L30 92 L31 104 L50 108 Z",
  // upper arm
  "M22 42 C18 47 17 56 17 64 L18 76 L28 77 L30 62 L29 46 Z",
  // forearm
  "M18 75 C15 84 13 93 12 104 L19 106 C21 97 24 87 28 77 Z",
  // hand
  "M12 103 C9 107 9 113 11 117 C13 119 17 118 18 115 L19 106 Z",
  // thigh
  "M31 98 C29 112 29 128 31 146 L47 146 C48 130 49 116 50 104 Z",
  // knee + lower leg
  "M31 144 C29 156 30 170 33 184 L43 184 C45 170 47 156 47 144 Z",
  // foot
  "M33 183 L43 183 L45 192 C40 194 33 194 29 192 Z",
];
const HEAD = "M50 4 C43 4 40 9 40 16 C40 23 44 28 50 28 C56 28 60 23 60 16 C60 9 57 4 50 4 Z";
const NECK = "M45 24 L55 24 L56 32 L44 32 Z";

// Muscle regions (left half; mirrored). Keys are the names in MUSCLES.
const FRONT = {
  traps: ["M44 29 L34 34 L44 35 Z"],
  shoulders: ["M31 34 C25 35 21 40 21 47 L25 50 C27 45 30 41 34 38 Z"],
  chest: ["M49 37 L35 37 C31 40 29 46 30 52 C35 56 43 57 49 55 Z"],
  biceps: ["M22 51 C19 56 18 63 19 72 L26 73 C28 65 28 57 26 50 Z"],
  forearms: ["M19 78 C16 85 14 93 13 101 L18 102 C20 94 23 86 26 78 Z"],
  abs: ["M49 58 L40 58 C39 70 39 82 41 95 L49 98 Z"],
  obliques: ["M38 58 C33 60 30 66 30 74 L32 90 L39 94 C37 82 37 70 38 58 Z"],
  quads: ["M33 105 C31 116 31 130 33 142 L41 143 C42 130 44 118 47 108 Z"],
  adductors: ["M48 108 C45 118 43 130 42 140 L45 142 C46 130 48 118 49.5 108 Z"],
  calves: ["M32 152 C30 162 31 172 34 180 L38 180 C37 170 36.5 160 36 151 Z"],
};

const BACK = {
  traps: ["M50 25 L45 29 L33 34 L42 40 L50 54 Z"],
  shoulders: ["M31 34 C25 35 21 40 21 47 L25 50 C27 45 30 41 34 38 Z"],
  "middle back": ["M50 54 L42 40 L37 42 C38.5 52 43 62 48 70 L50 70 Z"],
  lats: ["M37 42 C32 47 29 58 31 70 L41 83 L48 70 C43 62 38.5 52 37 42 Z"],
  "lower back": ["M50 70 L48 70 L41 83 L42 93 L50 95 Z"],
  triceps: ["M22 51 C19 56 18 63 19 72 L26 73 C28 65 28 57 26 50 Z"],
  forearms: ["M19 78 C16 85 14 93 13 101 L18 102 C20 94 23 86 26 78 Z"],
  glutes: ["M50 97 L42 95 C35 96 31 102 32 110 C35 116 44 117 50 114 Z"],
  hamstrings: ["M32 115 C30 125 31 135 33 143 L46 143 C47 134 48 125 49 117 C44 119 37 119 32 115 Z"],
  calves: ["M32 150 C29 158 30 168 34 176 L45 176 C47 168 47 158 45 150 C41 147 36 147 32 150 Z"],
};

const MIRROR = "translate(100 0) scale(-1 1)";

function el(tag, attrs = {}, children = []) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  for (const c of children) if (c) n.appendChild(c);
  return n;
}

function figure(regions, which, hits, onToggle) {
  const g = el("g", { class: `bm-figure bm-${which}` });
  const body = el("g", { class: "bm-body" });
  body.appendChild(el("path", { d: HEAD }));
  body.appendChild(el("path", { d: NECK }));
  for (const d of BODY_HALF) {
    body.appendChild(el("path", { d }));
    body.appendChild(el("path", { d, transform: MIRROR }));
  }
  g.appendChild(body);

  for (const [name, paths] of Object.entries(regions)) {
    const state = hits.primary.has(name) ? "primary" : hits.secondary.has(name) ? "secondary" : "idle";
    const rg = el("g", {
      class: `bm-region is-${state}`,
      "data-muscle": name,
    });
    rg.appendChild(el("title", {}, [document.createTextNode(state === "idle" ? name : `${name} (${state})`)]));
    for (const d of paths) {
      rg.appendChild(el("path", { d }));
      rg.appendChild(el("path", { d, transform: MIRROR }));
    }
    if (onToggle) {
      rg.setAttribute("role", "button");
      rg.setAttribute("tabindex", "0");
      rg.setAttribute("aria-label", name);
      rg.setAttribute("aria-pressed", String(state !== "idle"));
      rg.addEventListener("click", () => onToggle(name));
      rg.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(name);
        }
      });
    }
    g.appendChild(rg);
  }
  return g;
}

/** Which single view shows more of these muscles (used for compact thumbnails). */
export function bestView(primary = [], secondary = []) {
  const score = (regions) =>
    primary.reduce((n, m) => n + (m in regions ? 3 : 0), 0) + secondary.reduce((n, m) => n + (m in regions ? 1 : 0), 0);
  // Shared regions (shoulders, forearms, calves, traps) count for both; ties go to front.
  return score(BACK) > score(FRONT) ? "back" : "front";
}

/**
 * Build the body map SVG.
 * @returns {SVGSVGElement}
 */
export function bodyMap({ primary = [], secondary = [], view = "both", size = "md", label, onToggle, captions = false } = {}) {
  const hits = {
    primary: new Set(primary.filter((m) => MUSCLES.includes(m))),
    secondary: new Set(secondary.filter((m) => MUSCLES.includes(m) && !primary.includes(m))),
  };
  if (view === "auto") view = bestView([...hits.primary], [...hits.secondary]);
  const views = view === "both" ? ["front", "back"] : [view];
  const capH = captions ? 14 : 0;
  const width = views.length * 100 + (views.length - 1) * 8;
  const svg = el("svg", {
    class: `bodymap bodymap-${size}${onToggle ? " is-interactive" : ""}`,
    viewBox: `0 0 ${width} ${198 + capH}`,
    role: onToggle ? "group" : "img",
    "aria-label":
      label ||
      (hits.primary.size || hits.secondary.size
        ? `Muscles worked: ${[...hits.primary].join(", ") || "none"}${hits.secondary.size ? `; also ${[...hits.secondary].join(", ")}` : ""}`
        : "Body map, no muscles selected"),
  });
  views.forEach((v, i) => {
    const g = figure(v === "front" ? FRONT : BACK, v, hits, onToggle);
    g.setAttribute("transform", `translate(${i * 108} 2)`);
    svg.appendChild(g);
    if (captions) {
      const t = el("text", { x: i * 108 + 50, y: 198 + capH - 2, "text-anchor": "middle", class: "bm-caption" });
      t.textContent = v === "front" ? "Front" : "Back";
      svg.appendChild(t);
    }
  });
  return svg;
}

/** Combine several exercises' muscles: anything primary anywhere wins over secondary. */
export function combineMuscles(list) {
  const primary = new Set();
  const secondary = new Set();
  for (const m of list) {
    for (const p of m.primary || []) primary.add(p);
    for (const s of m.secondary || []) secondary.add(s);
  }
  for (const p of primary) secondary.delete(p);
  return { primary: [...primary], secondary: [...secondary] };
}
