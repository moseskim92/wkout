// Inline SVG line chart (no library), following the dataviz skill's mark specs:
// 2px lines, r=4 markers with a 2px surface ring, solid hairline grid, one y-axis,
// legend for 2+ series plus selective end labels, crosshair + tooltip listing every
// series at the hovered date, keyboard support (arrow keys), and a table twin
// rendered by the caller (Progress view).
//
// Colors come from CSS custom properties (--series-1, --series-2, --grid, ...) in
// styles.css, which carry separate validated light and dark values.

import { fmtDate, parseISODate } from "./ui.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEIGHT = 230; // includes the x-axis band, so the card never scrolls

function s(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "style") el.setAttribute("style", v);
    else el.setAttribute(k, String(v));
  }
  return el;
}

function niceStep(raw) {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * 10 ** exp;
}

function niceDomain(min, max, count = 4) {
  if (!isFinite(min) || !isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 5);
    min -= pad;
    max += pad;
  }
  min = Math.max(0, min);
  const step = niceStep((max - min) / count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

function compact(v) {
  if (Math.abs(v) >= 1000) return `${Math.round((v / 1000) * 10) / 10}K`;
  return String(Math.round(v * 10) / 10);
}

/**
 * Render a multi-series line chart into `container`.
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {Array<object>} opts.rows       data rows, oldest first; each has `date` (YYYY-MM-DD)
 * @param {Array<{key:string,name:string,color:string}>} opts.series  color = CSS var name, e.g. "--series-1"
 * @param {(v:number)=>string} opts.format value formatter for labels/tooltip
 * @param {string} opts.label             accessible description
 */
export function renderLineChart(container, opts) {
  if (container._chartObserver) container._chartObserver.disconnect();
  let lastWidth = 0;
  const draw = () => {
    const width = Math.max(260, Math.floor(container.clientWidth || 320));
    if (width === lastWidth) return;
    lastWidth = width;
    drawChart(container, opts, width);
  };
  draw();
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    container._chartObserver = ro;
  }
}

function drawChart(container, { rows, series, format = compact, label = "Line chart" }, width) {
  container.replaceChildren();
  container.classList.add("chart");

  // Legend: always present for 2+ series (line keys mirror the marks).
  if (series.length >= 2) {
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    for (const se of series) {
      const item = document.createElement("span");
      item.className = "legend-item";
      const key = document.createElement("span");
      key.className = "line-key";
      key.style.background = `var(${se.color})`;
      const name = document.createElement("span");
      name.textContent = se.name;
      item.append(key, name);
      legend.appendChild(item);
    }
    container.appendChild(legend);
  }

  const plotWrap = document.createElement("div");
  plotWrap.className = "chart-plot";
  container.appendChild(plotWrap);

  const values = rows.flatMap((r) => series.map((se) => Number(r[se.key]))).filter((v) => isFinite(v));
  const { lo, hi, ticks } = niceDomain(Math.min(...values), Math.max(...values));

  const yLabelW = Math.max(...ticks.map((t) => compact(t).length)) * 7 + 10;
  const endLabelW = Math.max(...series.map((se) => format(Number(rows.at(-1)?.[se.key]) || 0).length)) * 7 + 12;
  const m = { top: 12, right: Math.max(16, endLabelW), bottom: 28, left: Math.max(30, yLabelW) };
  const pw = width - m.left - m.right;
  const ph = HEIGHT - m.top - m.bottom;

  const times = rows.map((r) => parseISODate(r.date).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const x = (i) => (t1 === t0 ? m.left + pw / 2 : m.left + ((times[i] - t0) / (t1 - t0)) * pw);
  const y = (v) => m.top + ph - ((v - lo) / (hi - lo || 1)) * ph;

  const svg = s("svg", {
    width,
    height: HEIGHT,
    viewBox: `0 0 ${width} ${HEIGHT}`,
    role: "img",
    "aria-label": label,
    tabindex: 0,
    class: "chart-svg",
  });

  // Grid + y ticks (solid hairlines, recessive)
  for (const t of ticks) {
    const yy = Math.round(y(t)) + 0.5;
    svg.appendChild(
      s("line", { x1: m.left, x2: m.left + pw, y1: yy, y2: yy, class: t === lo ? "axis-line" : "grid-line" }),
    );
    const tx = s("text", { x: m.left - 8, y: yy, class: "tick", "text-anchor": "end", "dominant-baseline": "middle" });
    tx.textContent = compact(t);
    svg.appendChild(tx);
  }

  // X ticks: evenly spaced picks among the data dates, never closer than ~64px.
  const maxTicks = Math.max(2, Math.floor(pw / 72));
  const idx = [];
  if (rows.length <= maxTicks) rows.forEach((_, i) => idx.push(i));
  else for (let k = 0; k < maxTicks; k++) idx.push(Math.round((k * (rows.length - 1)) / (maxTicks - 1)));
  // Walk from the newest date backwards so the latest date always gets a label.
  let keptX = Infinity;
  for (const i of [...new Set(idx)].reverse()) {
    const xx = x(i);
    if (keptX - xx < 64) continue;
    keptX = xx;
    const anchor = rows.length === 1 ? "middle" : i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle";
    const tx = s("text", { x: xx, y: HEIGHT - 8, class: "tick", "text-anchor": anchor });
    tx.textContent = fmtDate(rows[i].date);
    svg.appendChild(tx);
  }

  // Crosshair (under the lines)
  const cross = s("line", { x1: 0, x2: 0, y1: m.top, y2: m.top + ph, class: "crosshair", visibility: "hidden" });
  svg.appendChild(cross);

  // Lines + markers
  const showAllMarkers = rows.length <= 40;
  const hoverDots = [];
  for (const se of series) {
    const color = `var(${se.color})`;
    const d = rows
      .map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(Number(r[se.key])).toFixed(1)}`)
      .join("");
    if (rows.length > 1) {
      svg.appendChild(s("path", { d, class: "series-line", style: `stroke:${color}` }));
    }
    rows.forEach((r, i) => {
      if (!showAllMarkers && i !== rows.length - 1) return;
      svg.appendChild(
        s("circle", { cx: x(i), cy: y(Number(r[se.key])), r: 4, class: "series-dot", style: `fill:${color}` }),
      );
    });
    const hd = s("circle", { r: 6, class: "series-dot hover-dot", style: `fill:${color}`, visibility: "hidden" });
    hoverDots.push(hd);
  }

  // Selective direct labels: the latest value at the end of each line, only if they don't collide.
  const last = rows.length - 1;
  const ends = series.map((se) => ({ se, yy: y(Number(rows[last][se.key])) })).sort((a, b) => a.yy - b.yy);
  const separated = ends.every((e, i) => i === 0 || e.yy - ends[i - 1].yy >= 14);
  if (separated) {
    for (const { se, yy } of ends) {
      const tx = s("text", { x: x(last) + 8, y: yy, class: "end-label", "dominant-baseline": "middle" });
      tx.textContent = format(Number(rows[last][se.key]));
      svg.appendChild(tx);
    }
  }
  hoverDots.forEach((hd) => svg.appendChild(hd));

  // Hit layer: the whole plot band, so the reader aims at a date, not a 2px line.
  const hit = s("rect", { x: m.left - 12, y: 0, width: pw + 24, height: HEIGHT, class: "hit", fill: "transparent" });
  svg.appendChild(hit);
  plotWrap.appendChild(svg);

  // Tooltip (HTML, values via textContent)
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  plotWrap.appendChild(tip);

  let active = -1;
  const show = (i) => {
    active = i;
    const xx = x(i);
    cross.setAttribute("x1", xx);
    cross.setAttribute("x2", xx);
    cross.setAttribute("visibility", "visible");
    series.forEach((se, k) => {
      hoverDots[k].setAttribute("cx", xx);
      hoverDots[k].setAttribute("cy", y(Number(rows[i][se.key])));
      hoverDots[k].setAttribute("visibility", "visible");
    });
    tip.replaceChildren();
    const head = document.createElement("div");
    head.className = "tip-date";
    head.textContent = fmtDate(rows[i].date, { weekday: true });
    tip.appendChild(head);
    for (const se of series) {
      const row = document.createElement("div");
      row.className = "tip-row";
      const key = document.createElement("span");
      key.className = "line-key";
      key.style.background = `var(${se.color})`;
      const val = document.createElement("strong");
      val.textContent = format(Number(rows[i][se.key]));
      const name = document.createElement("span");
      name.className = "tip-name";
      name.textContent = se.name;
      row.append(key, val, name);
      tip.appendChild(row);
    }
    if (rows[i].detail) {
      const det = document.createElement("div");
      det.className = "tip-detail";
      det.textContent = rows[i].detail;
      tip.appendChild(det);
    }
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = xx + 12;
    if (left + tw > width - 4) left = xx - 12 - tw;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${m.top}px`;
  };
  const hide = () => {
    active = -1;
    cross.setAttribute("visibility", "hidden");
    hoverDots.forEach((hd) => hd.setAttribute("visibility", "hidden"));
    tip.hidden = true;
  };
  const nearest = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestD = Infinity;
    rows.forEach((_, i) => {
      const dd = Math.abs(x(i) - px);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    return best;
  };
  svg.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerdown", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") hide();
  });
  svg.addEventListener("focus", () => show(active >= 0 ? active : rows.length - 1));
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(Math.max(0, (active < 0 ? rows.length : active) - 1));
    else if (e.key === "ArrowRight") show(Math.min(rows.length - 1, active + 1));
    else if (e.key === "Escape") hide();
    else return;
    e.preventDefault();
  });
}
