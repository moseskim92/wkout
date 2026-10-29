// Small DOM + formatting helpers shared by the views.

import { openExerciseDetail } from "./detail.js";

/**
 * Create an element. attrs: class, text, dataset, style (object), on<Event> handlers,
 * boolean attributes (true/false), anything else as an attribute.
 * Children: strings/numbers (as text), nodes, arrays, or null/false (skipped).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") el.value = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

// ---- toast ----------------------------------------------------------------------------

let toastTimer = null;
export function toast(message, kind = "error") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), kind === "error" ? 6000 : 2500);
}

export function showError(err) {
  console.warn(err);
  toast(err?.message || String(err), "error");
}

/** True when a click on a modal <dialog> landed on its backdrop (outside the box). */
export function isBackdropClick(e, dlg) {
  if (e.target !== dlg) return false;
  const r = dlg.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

// ---- confirm dialog (non-blocking replacement for window.confirm) ----------------------

export function confirmDialog(message, { okLabel = "Delete", danger = true } = {}) {
  return new Promise((resolve) => {
    const dlg = h(
      "dialog",
      { class: "sheet confirm" },
      h("p", { class: "confirm-text", text: message }),
      h(
        "div",
        { class: "row end gap" },
        h("button", { type: "button", class: "btn ghost", value: "cancel", text: "Cancel" }),
        h("button", { type: "button", class: danger ? "btn danger" : "btn primary", value: "ok", text: okLabel }),
      ),
    );
    let result = false;
    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) {
        result = b.value === "ok";
        dlg.close();
      } else if (isBackdropClick(e, dlg)) {
        dlg.close();
      }
    });
    dlg.addEventListener("close", () => {
      dlg.remove();
      resolve(result);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

// ---- dates ----------------------------------------------------------------------------

export function todayISO() {
  return toISODate(new Date());
}

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" as a local date (not UTC midnight). */
export function parseISODate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "Oct 21", or "Oct 21, 2025" when not this year. weekday: "Tue, Oct 21". */
export function fmtDate(iso, { weekday = false } = {}) {
  const d = parseISODate(iso);
  const opts = { month: "short", day: "numeric" };
  if (weekday) opts.weekday = "short";
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

export function relativeDay(iso) {
  const today = parseISODate(todayISO());
  const d = parseISODate(iso);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return fmtDate(iso, { weekday: true });
}

// ---- numbers --------------------------------------------------------------------------

/** 135 -> "135", 137.5 -> "137.5", 102.25 -> "102.25". */
export function fmtWeight(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return String(v);
}

export function fmtInt(n) {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

/** "135×8", or "8 reps" for a bodyweight-only set. */
export function fmtSet(s) {
  if (!s) return "";
  const w = Number(s.weight_lb) || 0;
  const r = Number(s.reps) || 0;
  return w > 0 ? `${fmtWeight(w)}×${r}` : `${r} reps`;
}

// ---- badges ---------------------------------------------------------------------------

export function equipBadge(equipment) {
  return h("span", { class: `badge equip equip-${equipment}`, text: equipment || "other" });
}

export function prBadge() {
  return h("span", { class: "badge pr", title: "Personal record: best top set so far" }, "PR");
}

/** Exercise name as a button that opens the how-to sheet. */
export function exerciseNameButton(ex) {
  return h("button", {
    type: "button",
    class: "ex-name ex-link",
    text: ex.name,
    title: `How to do ${ex.name}`,
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      openExerciseDetail(ex);
    },
  });
}

export function exerciseLabel(ex) {
  if (!ex) return h("span", { class: "ex-name muted", text: "Unknown exercise" });
  return h("span", { class: "ex-label" }, exerciseNameButton(ex), equipBadge(ex.equipment));
}

// ---- day tags ---------------------------------------------------------------------------

/** CSS class carrying a tag's hue: "full body" -> "tag-full-body". */
export function tagClass(tag) {
  return `tag-${String(tag).replace(/\s+/g, "-")}`;
}

export function tagBadge(tag) {
  return h("span", { class: `badge tag ${tagClass(tag)}`, text: tag });
}

/** A row of tag badges, or null when there are none. */
export function tagList(tags) {
  return tags && tags.length ? h("div", { class: "tags-inline" }, tags.map(tagBadge)) : null;
}

/** Toggle chip for a tag (used by Log and the History filter). */
export function tagToggle(tag, on, onclick) {
  return h("button", {
    type: "button",
    class: `chip tag-toggle ${tagClass(tag)}${on ? " on" : ""}`,
    "aria-pressed": String(Boolean(on)),
    text: tag,
    onclick,
  });
}

// ---- icons ------------------------------------------------------------------------------

const ICONS = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>',
  note: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5H12"/><path d="M14 4c.5 2.5 2.5 4 5 4"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
};

/** Small stroked 24x24 icon (decorative). */
export function icon(name) {
  const span = document.createElement("span");
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  return span.firstChild;
}

export function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}
