// App shell: boot, "who are you?" screen, tab routing, refetch on focus.

import { createStore } from "./store.js";
import { h, showError, toast } from "./ui.js";
import * as logView from "./views/log.js";
import * as historyView from "./views/history.js";
import * as progressView from "./views/progress.js";
import * as feedView from "./views/feed.js";

const ME_KEY = "workout-tracker:me";
const TAB_KEY = "workout-tracker:tab";
const VIEWS = { log: logView, history: historyView, progress: progressView, feed: feedView };

const $ = (id) => document.getElementById(id);

const state = {
  me: null,
  users: [],
  exercises: [],
  tab: "log",
  logDate: null, // set by the Log view (defaults to today)
  progressUserId: null,
  progressExerciseId: null,
};

let store = null;
let renderSeq = 0;

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: selection just won't persist */
  }
}

const ctx = {
  get store() {
    return store;
  },
  state,
  go,
  rerender: () => renderView({ keepFrame: true }),
  async refreshExercises() {
    state.exercises = await store.getExercises();
    return state.exercises;
  },
  async refreshUsers() {
    state.users = await store.getUsers();
    return state.users;
  },
  alive: () => true, // replaced per render
};

// ---- boot -------------------------------------------------------------------------------

async function boot() {
  try {
    store = await createStore();
  } catch (err) {
    showError(new Error(`Could not start the data layer: ${err.message}`));
    $("view").replaceChildren(h("p", { class: "empty", text: "Could not load. Check the console and config.js." }));
    return;
  }
  $("mode-badge").hidden = store.mode !== "local";

  $("switch-user").addEventListener("click", () => showWhoScreen());
  for (const btn of document.querySelectorAll("#tabbar [data-tab]")) {
    btn.addEventListener("click", () => go(btn.dataset.tab));
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !state.me) return;
    // Don't yank an input out from under someone mid-edit (e.g. after checking a text).
    const active = document.activeElement;
    if (active && $("view").contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
    if (document.querySelector("dialog[open]")) return;
    renderView({ keepFrame: true });
  });

  try {
    [state.users, state.exercises] = await Promise.all([store.getUsers(), store.getExercises()]);
  } catch (err) {
    showError(err);
  }

  const savedId = lsGet(ME_KEY);
  const me = state.users.find((u) => u.id === savedId);
  const savedTab = lsGet(TAB_KEY);
  if (savedTab && VIEWS[savedTab]) state.tab = savedTab;
  if (me) enterApp(me);
  else showWhoScreen();
}

// ---- who are you? -------------------------------------------------------------------------

async function showWhoScreen() {
  $("app").hidden = true;
  $("tabbar").hidden = true;
  $("switch-user").hidden = true;
  const screen = $("who");
  screen.hidden = false;

  const list = h("div", { class: "who-list" });
  const renderList = () => {
    list.replaceChildren(
      ...(state.users.length
        ? state.users.map((u) =>
            h("button", {
              type: "button",
              class: `who-btn${state.me && state.me.id === u.id ? " current" : ""}`,
              text: u.name,
              onclick: () => enterApp(u),
            }),
          )
        : [h("p", { class: "muted", text: "No one here yet. Add yourself below." })]),
    );
  };

  const input = h("input", {
    type: "text",
    id: "new-name",
    placeholder: "Your name",
    autocomplete: "off",
    autocapitalize: "words",
    maxlength: 40,
    enterkeyhint: "done",
  });
  const form = h(
    "form",
    {
      class: "row gap add-me",
      onsubmit: async (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) return input.focus();
        const btn = form.querySelector("button");
        btn.disabled = true;
        try {
          const u = await store.createUser(name);
          state.users = await store.getUsers();
          enterApp(u);
        } catch (err) {
          showError(err);
        } finally {
          btn.disabled = false;
        }
      },
    },
    h("label", { class: "sr-only", for: "new-name", text: "Your name" }),
    input,
    h("button", { type: "submit", class: "btn primary", text: "Add me" }),
  );

  screen.replaceChildren(
    h("h2", { text: "Who are you?" }),
    h("p", { class: "muted", text: "Pick your name. No password: this is for a trusted group." }),
    list,
    h("h3", { class: "section-title", text: "New here?" }),
    form,
  );
  renderList();

  try {
    state.users = await store.getUsers();
    renderList();
  } catch (err) {
    showError(err);
  }
}

function enterApp(user) {
  state.me = user;
  state.progressUserId = user.id;
  state.progressExerciseId = null;
  lsSet(ME_KEY, user.id);
  $("who").hidden = true;
  $("app").hidden = false;
  $("tabbar").hidden = false;
  const sw = $("switch-user");
  sw.hidden = false;
  sw.querySelector(".who-name").textContent = user.name;
  go(state.tab);
}

// ---- tabs ---------------------------------------------------------------------------------

function go(tab, opts = {}) {
  if (!VIEWS[tab]) tab = "log";
  if (opts.date) state.logDate = opts.date;
  if (opts.userId) {
    state.progressUserId = opts.userId;
    state.progressExerciseId = opts.exerciseId || null;
  }
  const changed = tab !== state.tab;
  state.tab = tab;
  lsSet(TAB_KEY, tab);
  for (const btn of document.querySelectorAll("#tabbar [data-tab]")) {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  }
  renderView({ keepFrame: !changed && $("view").dataset.tab === tab });
  if (changed) window.scrollTo(0, 0);
}

async function renderView({ keepFrame = false } = {}) {
  if (!state.me) return;
  const seq = ++renderSeq;
  const alive = () => seq === renderSeq;
  const root = $("view");
  if (!keepFrame || root.dataset.tab !== state.tab) {
    root.replaceChildren(h("p", { class: "loading", text: "Loading…" }));
  }
  root.dataset.tab = state.tab;
  root.classList.add("is-loading");
  try {
    await VIEWS[state.tab].render(root, { ...ctx, alive, store });
  } catch (err) {
    if (!alive()) return;
    showError(err);
    root.replaceChildren(
      h(
        "div",
        { class: "empty" },
        h("p", { text: "Couldn't load this view." }),
        h("button", { type: "button", class: "btn", text: "Try again", onclick: () => renderView() }),
      ),
    );
  } finally {
    if (alive()) root.classList.remove("is-loading");
  }
}

window.addEventListener("unhandledrejection", (e) => {
  toast(e.reason?.message || "Something went wrong.", "error");
});

boot();
