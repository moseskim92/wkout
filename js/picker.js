// Searchable exercise picker (modal dialog) with an inline "New exercise" form.
// Resolves to the chosen/created exercise, or null when dismissed.

import { bodyMap } from "./bodymap.js";
import { openExerciseDetail } from "./detail.js";
import { EQUIPMENT, MUSCLE_GROUPS, MUSCLES, musclesFor } from "./exercises-seed.js";
import { cap, equipBadge, h, icon, isBackdropClick, showError } from "./ui.js";

export function pickExercise(ctx) {
  const { store, state } = ctx;
  return new Promise((resolve) => {
    let chosen = null;
    const filters = { q: "", equipment: null, muscle: null };

    const search = h("input", {
      type: "search",
      class: "picker-search",
      placeholder: "Search exercises",
      "aria-label": "Search exercises",
      autocomplete: "off",
      enterkeyhint: "search",
    });
    const list = h("div", { class: "picker-list" });

    const chipRow = (values, key, label) => {
      const row = h("div", { class: "chips", role: "group", "aria-label": label });
      const paint = () => {
        for (const b of row.children) {
          const on = filters[key] === b.dataset.value;
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", String(on));
        }
      };
      for (const v of values) {
        row.appendChild(
          h("button", {
            type: "button",
            class: "chip",
            dataset: { value: v },
            text: v,
            "aria-pressed": "false",
            onclick: () => {
              filters[key] = filters[key] === v ? null : v;
              paint();
              renderList();
            },
          }),
        );
      }
      return row;
    };

    // ---- new exercise form ----
    const nameIn = h("input", { type: "text", placeholder: "Exercise name", maxlength: 60, "aria-label": "Exercise name" });
    const equipSel = h(
      "select",
      { "aria-label": "Equipment" },
      EQUIPMENT.map((e) => h("option", { value: e, text: cap(e) })),
    );
    const muscleSel = h(
      "select",
      { "aria-label": "Muscle group" },
      MUSCLE_GROUPS.map((m) => h("option", { value: m, text: cap(m) })),
    );
    // Muscles: chips and a tappable body map, kept in sync.
    const picked = new Set();
    const mapSlot = h("div", { class: "muscle-map" });
    const muscleChips = h("div", { class: "chips", role: "group", "aria-label": "Muscles worked" });
    const toggleMuscle = (m) => {
      if (picked.has(m)) picked.delete(m);
      else picked.add(m);
      paintMuscles();
    };
    for (const m of MUSCLES) {
      muscleChips.appendChild(
        h("button", {
          type: "button",
          class: "chip",
          dataset: { value: m },
          "aria-pressed": "false",
          text: m,
          onclick: () => toggleMuscle(m),
        }),
      );
    }
    function paintMuscles() {
      for (const b of muscleChips.children) {
        const on = picked.has(b.dataset.value);
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      }
      mapSlot.replaceChildren(
        bodyMap({ primary: [...picked], size: "md", onToggle: toggleMuscle, label: "Tap muscles to select them" }),
      );
    }
    paintMuscles();

    const createBtn = h("button", { type: "submit", class: "btn primary", text: "Create & add" });
    const newForm = h(
      "form",
      {
        class: "new-ex",
        hidden: true,
        onsubmit: async (e) => {
          e.preventDefault();
          const name = nameIn.value.trim();
          if (!name) return nameIn.focus();
          createBtn.disabled = true;
          try {
            const ex = await store.createExercise({
              name,
              equipment: equipSel.value,
              muscle_group: muscleSel.value,
              muscles: MUSCLES.filter((m) => picked.has(m)),
              created_by: state.me?.id || null,
            });
            await ctx.refreshExercises();
            chosen = ex;
            dlg.close();
          } catch (err) {
            showError(err);
          } finally {
            createBtn.disabled = false;
          }
        },
      },
      h("h3", { class: "section-title", text: "New exercise" }),
      nameIn,
      h("div", { class: "row gap" }, equipSel, muscleSel),
      h("p", { class: "hint", text: "Same movement on different equipment = a separate exercise." }),
      h("span", { class: "field-label", text: "Muscles worked (tap the map or the names)" }),
      h("div", { class: "muscle-pick" }, mapSlot, muscleChips),
      createBtn,
    );
    const toggleNew = h("button", {
      type: "button",
      class: "btn ghost",
      text: "+ New exercise",
      onclick: () => {
        newForm.hidden = !newForm.hidden;
        if (!newForm.hidden) {
          if (filters.q) nameIn.value = filters.q.replace(/\b\w/g, (c) => c.toUpperCase());
          if (filters.equipment) equipSel.value = filters.equipment;
          if (filters.muscle) muscleSel.value = filters.muscle;
          nameIn.focus();
          newForm.scrollIntoView({ block: "nearest" });
        }
      },
    });

    function renderList() {
      const q = filters.q.trim().toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      const items = state.exercises.filter((ex) => {
        if (filters.equipment && ex.equipment !== filters.equipment) return false;
        if (filters.muscle && ex.muscle_group !== filters.muscle) return false;
        const hay = `${ex.name} ${ex.equipment} ${ex.muscle_group} ${musclesFor(ex).primary.join(" ")}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
      if (!items.length) {
        list.replaceChildren(h("p", { class: "muted pad", text: "No matches. Create it with “+ New exercise”." }));
        return;
      }
      list.replaceChildren(
        ...items.map((ex) =>
          h(
            "div",
            { class: "picker-row" },
            h(
              "button",
              {
                type: "button",
                class: "picker-item",
                onclick: () => {
                  chosen = ex;
                  dlg.close();
                },
              },
              h("span", { class: "ex-name", text: ex.name }),
              equipBadge(ex.equipment),
              h("span", { class: "muted small push", text: ex.muscle_group }),
            ),
            h(
              "button",
              {
                type: "button",
                class: "icon-btn picker-info",
                "aria-label": `How to do ${ex.name} (${ex.equipment})`,
                title: "How to do it",
                onclick: () => openExerciseDetail(ex),
              },
              icon("info"),
            ),
          ),
        ),
      );
    }

    search.addEventListener("input", () => {
      filters.q = search.value;
      renderList();
    });

    const dlg = h(
      "dialog",
      { class: "sheet picker", "aria-label": "Add exercise" },
      h(
        "div",
        { class: "picker-head" },
        h("h2", { text: "Add exercise" }),
        h("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: () => dlg.close() }, icon("close")),
      ),
      search,
      chipRow(EQUIPMENT, "equipment", "Filter by equipment"),
      chipRow(MUSCLE_GROUPS, "muscle", "Filter by muscle group"),
      list,
      h("div", { class: "picker-foot" }, toggleNew),
      newForm,
    );
    dlg.addEventListener("click", (e) => {
      if (isBackdropClick(e, dlg)) dlg.close();
    });
    dlg.addEventListener("close", () => {
      dlg.remove();
      resolve(chosen);
    });

    renderList();
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}
