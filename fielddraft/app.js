/* Field Draft — a plan sheet with pitch, stairs, and drainage slope. */

const KEY = "fielddraft-v1";
const WALLS = ["n", "e", "s", "w"];
const WALL_NAME = { n: "North", e: "East", s: "South", w: "West" };
const FRAC = ["", "1/16", "1/8", "3/16", "1/4", "5/16", "3/8", "7/16", "1/2", "9/16", "5/8", "11/16", "3/4", "13/16", "7/8", "15/16"];

const canvas = document.getElementById("sheet");
const ctx = canvas.getContext("2d");

const state = defaultState();

function defaultState() {
  return {
    project: "New building",
    drawnBy: "",
    w: 24 * 12,
    d: 32 * 12,
    h: 8 * 12,
    pitch: 6,
    span: "width",
    door: { wall: "s", offset: 4 * 12, width: 3 * 12 },
    window: { wall: "n", offset: 10 * 12, width: 4 * 12 },
    rise: 9 * 12,
    tread: 10,
    drainRun: 20,
    drainDrop: 5,
  };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtLen(inches) {
  const neg = inches < 0 ? "−" : "";
  let six = Math.round(Math.abs(inches) * 16);
  const ft = Math.floor(six / (12 * 16));
  six -= ft * 12 * 16;
  const inch = Math.floor(six / 16);
  const frac = six % 16;
  const bits = [];
  if (ft) bits.push(`${ft}′`);
  if (inch && frac) bits.push(`${inch} ${FRAC[frac]}″`);
  else if (inch) bits.push(`${inch}″`);
  else if (frac) bits.push(`${FRAC[frac]}″`);
  else if (!ft) bits.push("0″");
  return neg + bits.join(" ");
}

function splitInches(inches) {
  const abs = Math.max(0, Math.round(inches));
  return { ft: Math.floor(abs / 12), inch: abs % 12 };
}

function roofMath() {
  const span = state.span === "depth" ? state.d : state.w;
  const run = span / 2;
  const rise = run * (state.pitch / 12);
  const rafter = Math.hypot(run, rise);
  const angle = Math.atan2(state.pitch, 12) * 180 / Math.PI;
  const pct = (state.pitch / 12) * 100;
  return { span, run, rise, rafter, angle, pct };
}

function stairMath() {
  const n = Math.max(2, Math.ceil(state.rise / 7.75 - 1e-9));
  const riser = state.rise / n;
  const treads = n - 1;
  const totalRun = treads * state.tread;
  const angle = Math.atan2(riser, state.tread) * 180 / Math.PI;
  return {
    n,
    riser,
    treads,
    totalRun,
    angle,
    riserOk: riser <= 7.75 + 1e-6,
    treadOk: state.tread >= 10 - 1e-6,
  };
}

function drainMath() {
  const perFt = state.drainRun > 0 ? state.drainDrop / state.drainRun : 0;
  const pct = state.drainRun > 0 ? (state.drainDrop / (state.drainRun * 12)) * 100 : 0;
  return { perFt, pct };
}

function normalize() {
  state.w = clamp(state.w, 72, 960);
  state.d = clamp(state.d, 72, 960);
  state.h = clamp(state.h, 84, 360);
  state.pitch = clamp(state.pitch, 0, 24);
  if (state.span !== "depth") state.span = "width";
  state.rise = clamp(state.rise, 14, 240);
  state.tread = clamp(state.tread, 6, 18);
  state.drainRun = clamp(state.drainRun, 1, 200);
  state.drainDrop = clamp(state.drainDrop, 0, 120);
  for (const op of [state.door, state.window]) {
    if (!WALLS.includes(op.wall)) op.wall = "s";
    const len = op.wall === "n" || op.wall === "s" ? state.w : state.d;
    op.width = clamp(op.width, 12, len);
    op.offset = clamp(op.offset, 0, Math.max(0, len - op.width));
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(state, data);
    if (data.door) state.door = { ...defaultState().door, ...data.door };
    if (data.window) state.window = { ...defaultState().window, ...data.window };
  } catch { /* ignore a bad save */ }
}

function readPair(ftId, inId) {
  return (Number(document.getElementById(ftId).value) || 0) * 12 + (Number(document.getElementById(inId).value) || 0);
}

function setPair(ftId, inId, inches) {
  const parts = splitInches(inches);
  const ft = document.getElementById(ftId);
  const inch = document.getElementById(inId);
  if (document.activeElement !== ft) ft.value = String(parts.ft);
  if (inch && document.activeElement !== inch) inch.value = String(parts.inch);
}

function readForm() {
  state.project = document.getElementById("project").value.trim() || "New building";
  state.drawnBy = document.getElementById("drawn-by").value.trim();
  state.w = readPair("w-ft", "w-in");
  state.d = readPair("d-ft", "d-in");
  state.h = readPair("h-ft", "h-in");
  state.pitch = Number(document.getElementById("pitch").value) || 0;
  state.span = document.getElementById("span").value;
  state.door.wall = document.getElementById("door-wall").value;
  state.door.offset = readPair("door-ft", "door-in");
  state.door.width = readPair("door-w-ft", "door-w-in");
  state.window.wall = document.getElementById("win-wall").value;
  state.window.offset = readPair("win-ft", "win-in");
  state.window.width = readPair("win-w-ft", "win-w-in");
  state.rise = readPair("rise-ft", "rise-in");
  state.tread = Number(document.getElementById("tread").value) || 10;
  state.drainRun = Number(document.getElementById("drain-ft").value) || 1;
  state.drainDrop = Number(document.getElementById("drain-in").value) || 0;
  normalize();
}

function fillForm() {
  const project = document.getElementById("project");
  const drawn = document.getElementById("drawn-by");
  if (document.activeElement !== project) project.value = state.project;
  if (document.activeElement !== drawn) drawn.value = state.drawnBy;
  setPair("w-ft", "w-in", state.w);
  setPair("d-ft", "d-in", state.d);
  setPair("h-ft", "h-in", state.h);
  const pitch = document.getElementById("pitch");
  if (document.activeElement !== pitch) pitch.value = String(state.pitch);
  document.getElementById("span").value = state.span;
  document.getElementById("door-wall").value = state.door.wall;
  setPair("door-ft", "door-in", state.door.offset);
  setPair("door-w-ft", "door-w-in", state.door.width);
  document.getElementById("win-wall").value = state.window.wall;
  setPair("win-ft", "win-in", state.window.offset);
  setPair("win-w-ft", "win-w-in", state.window.width);
  setPair("rise-ft", "rise-in", state.rise);
  const tread = document.getElementById("tread");
  if (document.activeElement !== tread) tread.value = String(state.tread);
  const run = document.getElementById("drain-ft");
  const drop = document.getElementById("drain-in");
  if (document.activeElement !== run) run.value = String(state.drainRun);
  if (document.activeElement !== drop) drop.value = String(state.drainDrop);
}

function renderNumbers() {
  const roof = roofMath();
  const stairs = stairMath();
  const drain = drainMath();
  document.getElementById("roof-out").textContent =
    `${state.pitch}:12 · ${roof.angle.toFixed(1)}° · ${roof.pct.toFixed(roof.pct >= 10 ? 0 : 1)}%. ` +
    `Span ${fmtLen(roof.span)}, rise ${fmtLen(roof.rise)}, rafter ${fmtLen(roof.rafter)}.`;
  document.getElementById("stair-out").textContent =
    `${stairs.n} risers at ${fmtLen(stairs.riser)}, ${stairs.treads} treads, run ${fmtLen(stairs.totalRun)}, ${stairs.angle.toFixed(1)}°.`;
  const flag = document.getElementById("stair-flag");
  const problems = [];
  if (!stairs.riserOk) problems.push(`The riser is ${fmtLen(stairs.riser)}, over 7 3/4″.`);
  if (!stairs.treadOk) problems.push(`The tread is ${fmtLen(state.tread)}, under 10″.`);
  if (problems.length) {
    flag.className = "flag warn";
    flag.textContent = `${problems.join(" ")} A common residential habit is a riser of 7 3/4″ or less and a tread of 10″ or more. Confirm the code your county adopted.`;
  } else {
    flag.className = "flag ok";
    flag.textContent = "Riser and tread sit inside a common residential habit: 7 3/4″ and 10″. Confirm the code your county adopted.";
  }
  document.getElementById("drain-out").textContent =
    `${fmtLen(drain.perFt)} per ft · ${drain.pct.toFixed(1)}%.`;
}

function sync() {
  fillForm();
  renderNumbers();
  draw();
  save();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

function holesOn(wall) {
  return [state.door, state.window].filter((op) => op.wall === wall);
}

function segments(length, holes) {
  const cuts = holes
    .map((op) => [op.offset, op.offset + op.width])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = 0;
  for (const [a, b] of cuts) {
    if (a > cursor) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < length) out.push([cursor, length]);
  return out;
}

function wallPoint(wall, t) {
  if (wall === "n") return [t, 0];
  if (wall === "s") return [t, state.d];
  if (wall === "w") return [0, t];
  return [state.w, t];
}

function outwardPoint(wall, t, out) {
  if (wall === "n") return [t, -out];
  if (wall === "s") return [t, state.d + out];
  if (wall === "w") return [-out, t];
  return [state.w + out, t];
}

function draw() {
  const { w, h } = resizeCanvas();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0e3358";
  ctx.fillRect(0, 0, w, h);

  const pad = 72;
  const titleH = 88;
  const availW = Math.max(40, w - pad * 2);
  const availH = Math.max(40, h - pad - titleH);
  const scale = Math.min(availW / state.w, availH / state.d);
  const ox = (w - state.w * scale) / 2;
  const oy = 36 + (availH - state.d * scale) / 2;
  const X = (x) => ox + x * scale;
  const Y = (y) => oy + y * scale;

  ctx.save();
  ctx.strokeStyle = "rgba(232, 244, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= state.w; x += 48) {
    ctx.moveTo(X(x), Y(0));
    ctx.lineTo(X(x), Y(state.d));
  }
  for (let y = 0; y <= state.d; y += 48) {
    ctx.moveTo(X(0), Y(y));
    ctx.lineTo(X(state.w), Y(y));
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#e8f4ff";
  ctx.lineWidth = 4;
  ctx.lineCap = "square";
  ctx.beginPath();
  for (const wall of WALLS) {
    const len = wall === "n" || wall === "s" ? state.w : state.d;
    for (const [a, b] of segments(len, holesOn(wall))) {
      const p = wallPoint(wall, a);
      const q = wallPoint(wall, b);
      ctx.moveTo(X(p[0]), Y(p[1]));
      ctx.lineTo(X(q[0]), Y(q[1]));
    }
  }
  ctx.stroke();
  ctx.restore();

  drawDoor(X, Y, scale);
  drawWindow(X, Y);
  drawDims(X, Y);
  drawNorth(ox, oy);
  drawPitchMark(w);
  drawTitle(w, h);
}

function drawDoor(X, Y, scale) {
  const door = state.door;
  const hinge = wallPoint(door.wall, door.offset);
  const angles = {
    n: [0, Math.PI / 2],
    s: [0, -Math.PI / 2],
    e: [Math.PI / 2, Math.PI],
    w: [Math.PI / 2, 0],
  }[door.wall];
  const [a0, a1] = angles;
  const px = X(hinge[0]);
  const py = Y(hinge[1]);
  const r = door.width * scale;
  ctx.save();
  ctx.strokeStyle = "rgba(232, 244, 255, 0.85)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(px, py, r, a0, a1, a1 < a0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(a1) * r, py + Math.sin(a1) * r);
  ctx.stroke();
  ctx.restore();
}

function drawWindow(X, Y) {
  const win = state.window;
  const a = outwardPoint(win.wall, win.offset, 0);
  const b = outwardPoint(win.wall, win.offset + win.width, 0);
  const c = outwardPoint(win.wall, win.offset, 4);
  const d = outwardPoint(win.wall, win.offset + win.width, 4);
  ctx.save();
  ctx.strokeStyle = "#9fd0ea";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(a[0]), Y(a[1]));
  ctx.lineTo(X(b[0]), Y(b[1]));
  ctx.moveTo(X(c[0]), Y(c[1]));
  ctx.lineTo(X(d[0]), Y(d[1]));
  ctx.stroke();
  ctx.restore();
}

function drawDims(X, Y) {
  ctx.save();
  ctx.strokeStyle = "#b7d4ee";
  ctx.fillStyle = "#d5e8f6";
  ctx.lineWidth = 1;
  ctx.font = `12px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const y = Y(state.d) + 18;
  ctx.beginPath();
  ctx.moveTo(X(0), y);
  ctx.lineTo(X(state.w), y);
  ctx.moveTo(X(0), y - 5);
  ctx.lineTo(X(0), y + 5);
  ctx.moveTo(X(state.w), y - 5);
  ctx.lineTo(X(state.w), y + 5);
  ctx.stroke();
  ctx.fillText(fmtLen(state.w), (X(0) + X(state.w)) / 2, y + 8);

  ctx.save();
  ctx.translate(X(state.w) + 22, (Y(0) + Y(state.d)) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fmtLen(state.d), 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawNorth(ox, oy) {
  ctx.save();
  ctx.fillStyle = "#e8f4ff";
  ctx.font = `12px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.beginPath();
  ctx.moveTo(ox - 28, oy + 8);
  ctx.lineTo(ox - 28, oy - 18);
  ctx.strokeStyle = "#e8f4ff";
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ox - 28, oy - 22);
  ctx.lineTo(ox - 33, oy - 12);
  ctx.lineTo(ox - 23, oy - 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillText("N", ox - 24, oy - 30);
  ctx.restore();
}

function drawPitchMark(w) {
  const roof = roofMath();
  const x = w - 132;
  const y = 28;
  const base = 64;
  const rise = Math.min(48, base * (state.pitch / 12));
  ctx.save();
  ctx.strokeStyle = "#e8f4ff";
  ctx.fillStyle = "#d5e8f6";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(x, y + 48);
  ctx.lineTo(x + base, y + 48);
  ctx.lineTo(x + base, y + 48 - rise);
  ctx.closePath();
  ctx.stroke();
  ctx.font = `12px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`${state.pitch}:12`, x, y + 66);
  ctx.fillText(`rafter ${fmtLen(roof.rafter)}`, x, y + 82);
  ctx.restore();
}

function drawTitle(w, h) {
  const roof = roofMath();
  const x = 16;
  const y = h - 84;
  const bw = w - 32;
  ctx.save();
  ctx.fillStyle = "#0a2744";
  ctx.strokeStyle = "#9eb6cc";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, bw, 68);
  ctx.strokeRect(x, y, bw, 68);
  ctx.fillStyle = "#e8f4ff";
  ctx.font = `600 14px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(state.project, x + 12, y + 8);
  ctx.font = `12px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.fillStyle = "#d5e8f6";
  const who = state.drawnBy ? ` · ${state.drawnBy}` : "";
  ctx.fillText(`${fmtLen(state.w)} × ${fmtLen(state.d)} · walls ${fmtLen(state.h)}${who}`, x + 12, y + 28);
  ctx.fillText(`${state.pitch}:12 ${state.span === "depth" ? "across the length" : "across the width"} · rafter ${fmtLen(roof.rafter)}`, x + 12, y + 46);
  ctx.fillStyle = "#9eb6cc";
  ctx.textAlign = "right";
  ctx.fillText("Drafting aid. Not a permit set.", x + bw - 12, y + 46);
  ctx.restore();
}

function boot() {
  load();
  normalize();
  fillForm();
  renderNumbers();
  draw();
  save();
  const onEdit = () => {
    readForm();
    renderNumbers();
    draw();
    save();
  };
  document.querySelector("aside").addEventListener("input", onEdit);
  document.querySelector("aside").addEventListener("change", onEdit);
  new ResizeObserver(() => draw()).observe(canvas.parentElement);
}

boot();
