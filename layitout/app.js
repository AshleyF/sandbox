/* Lay It Out — a measured room you can drag furniture around. */

const KEY = "layitout-v1";
const ROOMS_KEY = "layitout-rooms-v1";
const WALLS = ["n", "e", "s", "w"];
const DEFAULT_LABELS = { n: "North", e: "East", s: "South", w: "West" };
const OPP = { n: "s", s: "n", e: "w", w: "e" };

const CATALOG = [
  { type: "bed", name: "Twin bed", w: 38, d: 75, h: 42 },
  { type: "bed", name: "Full bed", w: 54, d: 75, h: 48 },
  { type: "bed", name: "Queen bed", w: 60, d: 80, h: 52 },
  { type: "bed", name: "King bed", w: 76, d: 80, h: 54 },
  { type: "nightstand", name: "Nightstand", w: 22, d: 16, h: 26 },
  { type: "dresser", name: "Dresser", w: 60, d: 18, h: 34 },
  { type: "dresser", name: "Tall dresser", w: 36, d: 18, h: 52 },
  { type: "desk", name: "Desk", w: 48, d: 24, h: 30 },
  { type: "chair", name: "Desk chair", w: 20, d: 20, h: 34 },
  { type: "sofa", name: "Sofa", w: 84, d: 36, h: 34 },
  { type: "sofa", name: "Loveseat", w: 58, d: 36, h: 34 },
  { type: "armchair", name: "Armchair", w: 32, d: 34, h: 33 },
  { type: "coffee", name: "Coffee table", w: 48, d: 24, h: 17 },
  { type: "dining", name: "Dining table", w: 60, d: 36, h: 30 },
  { type: "bookshelf", name: "Bookshelf", w: 30, d: 12, h: 72 },
  { type: "tv", name: "TV stand", w: 48, d: 16, h: 22 },
  { type: "rug", name: "Rug", w: 96, d: 120, h: 1 },
  { type: "plant", name: "Plant", w: 16, d: 16, h: 40 },
  { type: "tub", name: "Alcove tub", w: 60, d: 32, h: 20, group: "Bath" },
  { type: "toilet", name: "Toilet", w: 20, d: 28, h: 31, group: "Bath" },
  { type: "vanity", name: "Vanity", w: 36, d: 21, h: 34, group: "Bath" },
];

const COLOR = {
  bed: "#8d5e45",
  nightstand: "#c6a07a",
  dresser: "#6e5646",
  desk: "#3f6b5e",
  chair: "#4d7c6e",
  sofa: "#6d4f73",
  armchair: "#8d5a66",
  coffee: "#b08a62",
  dining: "#a67c52",
  bookshelf: "#4a453e",
  tv: "#3c4650",
  rug: "#c4785a",
  plant: "#2f6a45",
  tub: "#d5dde2",
  toilet: "#e7e4dc",
  vanity: "#6e5646",
};

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");

const state = {
  room: null,
  pieces: [],
  mode: "flow",
  view: "plan",
  corner: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedId: null,
  pristine: false,
  past: [],
  future: [],
  saveError: "",
  units: "us",
  libraryId: null,
  library: [],
};

const images = new Map();
let hatch = null;
let focusSnap = null;
let drag = null;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function metric() {
  return state.units === "metric";
}

function cmToIn(cm) {
  return cm / 2.54;
}

function toCm(inches) {
  return Math.round(Math.abs(inches) * 2.54);
}

function quantize(inches) {
  const whole = Math.round(inches);
  if (Math.abs(inches - whole) < 1e-4) return whole;
  return Math.round(inches * 25.4) / 25.4;
}

function fmt(inches) {
  const sign = inches < 0 ? "-" : "";
  if (metric()) return `${sign}${toCm(inches)} cm`;
  let n = Math.round(Math.abs(inches));
  const f = Math.floor(n / 12);
  const i = n % 12;
  if (f && i) return `${sign}${f}′ ${i}″`;
  if (f) return `${sign}${f}′`;
  return `${sign}${i}″`;
}

function fmtRoom(inches) {
  if (!metric()) return fmt(inches);
  const meters = Math.abs(inches) * 0.0254;
  const sign = inches < 0 ? "-" : "";
  if (meters >= 1) return `${sign}${meters.toFixed(2)} m`;
  return fmt(inches);
}

function fmtPair(w, d) {
  if (!metric()) return `${fmt(w)} × ${fmt(d)}`;
  return `${toCm(w)} × ${toCm(d)} cm`;
}

function fmtTriple(w, d, h) {
  if (!metric()) return `${fmt(w)} × ${fmt(d)} × ${fmt(h)}`;
  return `${toCm(w)} × ${toCm(d)} × ${toCm(h)} cm`;
}

function areaText(sqIn) {
  const sqFt = sqIn / 144;
  if (!metric()) return `${Math.round(sqFt)} sq ft`;
  const m2 = sqFt * 0.09290304;
  return `${m2 >= 10 ? m2.toFixed(1) : m2.toFixed(2)} m²`;
}

function splitInches(inches) {
  const n = Math.max(0, Math.round(inches));
  return { ft: Math.floor(n / 12), inch: n % 12 };
}

function readDim(ftId, inId) {
  if (metric()) return cmToIn(Number(document.getElementById(ftId).value) || 0);
  const ft = Number(document.getElementById(ftId).value) || 0;
  const inch = Number(document.getElementById(inId).value) || 0;
  return ft * 12 + inch;
}

function setDim(ftId, inId, inches) {
  const ftEl = document.getElementById(ftId);
  const inEl = document.getElementById(inId);
  if (metric()) {
    if (document.activeElement !== ftEl) ftEl.value = toCm(inches);
    return;
  }
  const { ft, inch } = splitInches(inches);
  if (document.activeElement !== ftEl) ftEl.value = ft;
  if (document.activeElement !== inEl) inEl.value = inch;
}

function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => {
    const next = t < 0 ? c * (1 + t) : c + (255 - c) * t;
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#241e18" : "#f7f3eb";
}

function wallLen(room, wall) {
  return wall === "n" || wall === "s" ? room.w : room.d;
}

function wallName(room, wall) {
  return (room.labels && room.labels[wall]) || DEFAULT_LABELS[wall];
}

function wallPhrase(room, wall) {
  const name = wallName(room, wall);
  if (/wall$/i.test(name)) return name;
  if (["north", "east", "south", "west"].includes(name.toLowerCase())) return `the ${name} wall`;
  return name;
}

function footprint(piece, rot) {
  const r = ((rot % 360) + 360) % 360;
  return r % 180 !== 0 ? { w: piece.d, d: piece.w } : { w: piece.w, d: piece.d };
}

function bounds(p) {
  const fp = footprint(p, p.rot || 0);
  return { x: p.x || 0, y: p.y || 0, w: fp.w, d: fp.d };
}

function wallFromRot(rot) {
  return WALLS[((((rot || 0) % 360) + 360) % 360) / 90 | 0];
}

function frontVector(rot) {
  return { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }[(((rot % 360) + 360) % 360)] || [0, 1];
}

function overlapArea(a, b) {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  if (x <= 0 || y <= 0) return 0;
  return x * y;
}

function gapBetween(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.d), b.y - (a.y + a.d)));
  if (dx === 0) return dy;
  if (dy === 0) return dx;
  return Math.hypot(dx, dy);
}

function inside(room, box) {
  return box.x >= -0.5 && box.y >= -0.5 && box.x + box.w <= room.w + 0.5 && box.y + box.d <= room.d + 0.5;
}

function zoneRect(room, opening, depth) {
  if (opening.wall === "n") return { x: opening.offset, y: 0, w: opening.width, d: depth };
  if (opening.wall === "s") return { x: opening.offset, y: room.d - depth, w: opening.width, d: depth };
  if (opening.wall === "w") return { x: 0, y: opening.offset, w: depth, d: opening.width };
  return { x: room.w - depth, y: opening.offset, w: depth, d: opening.width };
}

function swingRectFor(room, door) {
  return zoneRect(room, door, door.width);
}

function pathRectFor(room, door) {
  const extra = 4;
  const opening = {
    wall: door.wall,
    offset: Math.max(0, door.offset - extra),
    width: door.width + extra * 2,
  };
  const len = wallLen(room, opening.wall);
  if (opening.offset + opening.width > len) opening.width = len - opening.offset;
  return zoneRect(room, opening, door.width + 18);
}

function entryDoor(room) {
  return room.doors && room.doors[0];
}

function closetZones(room) {
  return room.closets.map((c) => zoneRect(room, c, c.kind === "sliding" ? 18 : c.width));
}

function distanceToWall(box, wall, room) {
  if (wall === "n") return box.y;
  if (wall === "s") return room.d - (box.y + box.d);
  if (wall === "w") return box.x;
  return room.w - (box.x + box.w);
}

function againstWall(room, box) {
  return WALLS.some((w) => distanceToWall(box, w, room) < 8);
}

function spanOverlap(box, opening) {
  const piece = opening.wall === "n" || opening.wall === "s"
    ? [box.x, box.x + box.w]
    : [box.y, box.y + box.d];
  const hole = [opening.offset, opening.offset + opening.width];
  return piece[0] < hole[1] - 2 && hole[0] < piece[1] - 2;
}

function windowOn(room, box, wall) {
  return room.windows.some((w) => w.wall === wall && spanOverlap(box, w));
}

function allOpenings(room) {
  return [...(room.doors || []), ...(room.windows || []), ...(room.closets || [])];
}

function clampPiece(room, piece) {
  const fp = footprint(piece, piece.rot || 0);
  const maxX = Math.max(0, room.w - fp.w);
  const maxY = Math.max(0, room.d - fp.d);
  piece.x = clamp(piece.x || 0, 0, maxX);
  piece.y = clamp(piece.y || 0, 0, maxY);
}

function normalize(room, pieces) {
  room.w = clamp(quantize(room.w), 72, 720);
  room.d = clamp(quantize(room.d), 72, 720);
  room.h = clamp(quantize(room.h), 84, 240);
  room.labels = { ...DEFAULT_LABELS, ...(room.labels || {}) };
  room.windows = room.windows || [];
  room.closets = room.closets || [];
  if (!Array.isArray(room.doors)) {
    const old = room.door && typeof room.door === "object" ? room.door : null;
    room.doors = old ? [{
      id: old.id || "door",
      wall: old.wall,
      offset: old.offset,
      width: old.width,
      height: old.height,
      hinge: old.hinge,
    }] : [];
  }
  delete room.door;
  for (const door of room.doors) {
    if (!door.id) door.id = uid();
    if (door.hinge !== "end") door.hinge = "start";
  }
  if (room.project !== "remodel") room.project = "furnish";
  if (!room.remodel || typeof room.remodel !== "object") room.remodel = defaultRemodel();
  const remodel = room.remodel;
  if (!["tile", "vinyl", "keep"].includes(remodel.floor)) remodel.floor = "keep";
  if (!["tile", "kit", "none"].includes(remodel.wetWalls)) remodel.wetWalls = "none";
  remodel.tileHeight = clamp(quantize(Number(remodel.tileHeight) || 72), 36, room.h);
  remodel.waste = clamp(Math.round(Number(remodel.waste) || 10), 0, 30);
  if (!remodel.got || typeof remodel.got !== "object") remodel.got = {};
  for (const op of allOpenings(room)) {
    const len = wallLen(room, op.wall);
    op.width = clamp(quantize(op.width), 12, Math.max(12, len));
    op.offset = clamp(quantize(op.offset), 0, Math.max(0, len - op.width));
    if (op.sill != null) op.sill = clamp(quantize(op.sill), 0, room.h - 12);
    if (op.height != null) op.height = clamp(quantize(op.height), 12, room.h - (op.sill || 0));
  }
  for (const door of room.doors) {
    door.height = clamp(quantize(door.height || 80), 60, room.h);
  }
  for (const p of pieces) {
    p.w = clamp(quantize(p.w), 4, 240);
    p.d = clamp(quantize(p.d), 4, 240);
    p.h = clamp(quantize(p.h), 1, 144);
    p.rot = ((p.rot || 0) % 360 + 360) % 360;
    clampPiece(room, p);
  }
}

function defaultRemodel() {
  return { floor: "keep", wetWalls: "none", tileHeight: 72, waste: 10, got: {} };
}

function sampleDocument() {
  return {
    version: 1,
    pristine: true,
    mode: "flow",
    view: "plan",
    corner: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedId: "bed",
    room: {
      name: "Front bedroom",
      w: 144,
      d: 156,
      h: 96,
      labels: { ...DEFAULT_LABELS },
      doors: [{ id: "door", wall: "s", offset: 24, width: 32, height: 80, hinge: "start" }],
      windows: [{ id: "win1", wall: "n", offset: 48, width: 60, sill: 30, height: 48 }],
      closets: [{ id: "cl1", wall: "s", offset: 84, width: 48, kind: "sliding", hinge: "start", height: 80 }],
    },
    pieces: [
      { id: "bed", type: "bed", name: "Queen bed", w: 60, d: 80, h: 52, rot: 90, x: 64, y: 30, photo: null },
      { id: "ns1", type: "nightstand", name: "Nightstand", w: 22, d: 16, h: 26, rot: 90, x: 128, y: 8, photo: null },
      { id: "ns2", type: "nightstand", name: "Nightstand", w: 22, d: 16, h: 26, rot: 90, x: 128, y: 90, photo: null },
      { id: "dresser", type: "dresser", name: "Dresser", w: 58, d: 18, h: 34, rot: 0, x: 8, y: 0, photo: null },
      { id: "desk", type: "desk", name: "Desk", w: 48, d: 24, h: 30, rot: 270, x: 0, y: 24, photo: null },
      { id: "chair", type: "chair", name: "Desk chair", w: 18, d: 18, h: 32, rot: 90, x: 24, y: 39, photo: null },
      { id: "shelf", type: "bookshelf", name: "Bookshelf", w: 30, d: 12, h: 72, rot: 90, x: 132, y: 118, photo: null },
      { id: "chair2", type: "armchair", name: "Armchair", w: 32, d: 34, h: 33, rot: 270, x: 0, y: 74, photo: null },
      { id: "rug", type: "rug", name: "Rug", w: 84, d: 100, h: 1, rot: 0, x: 56, y: 16, photo: null },
    ],
  };
}

function sampleBath() {
  return {
    version: 1,
    pristine: true,
    mode: "flow",
    view: "plan",
    corner: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedId: null,
    room: {
      name: "Hall bath",
      w: 96,
      d: 120,
      h: 96,
      project: "remodel",
      remodel: { floor: "tile", wetWalls: "tile", tileHeight: 72, waste: 10, got: {} },
      labels: { ...DEFAULT_LABELS },
      doors: [{ id: "doorb", wall: "s", offset: 52, width: 32, height: 80, hinge: "end" }],
      windows: [{ id: "winb", wall: "n", offset: 12, width: 36, sill: 48, height: 36 }],
      closets: [],
    },
    pieces: [
      { id: "tub", type: "tub", name: "Alcove tub", w: 60, d: 32, h: 20, rot: 0, x: 0, y: 0, photo: null },
      { id: "toilet", type: "toilet", name: "Toilet", w: 20, d: 28, h: 31, rot: 90, x: 68, y: 40, photo: null },
      { id: "vanity", type: "vanity", name: "Vanity", w: 36, d: 21, h: 34, rot: 180, x: 8, y: 99, photo: null },
    ],
  };
}

function snapshot() {
  return {
    room: structuredClone(state.room),
    pieces: state.pieces.map((p) => ({ ...p })),
    selectedId: state.selectedId,
    mode: state.mode,
    libraryId: state.libraryId,
  };
}

function sig(snap) {
  const pieces = snap.pieces.map((p) => {
    const { photo, ...rest } = p;
    return { ...rest, photo: photo ? `${photo.length}:${photo.slice(-16)}` : "" };
  });
  return JSON.stringify({ room: snap.room, pieces, mode: snap.mode, libraryId: snap.libraryId || null });
}

function commit(before) {
  if (!before || sig(before) === sig(snapshot())) return;
  state.past.push(before);
  state.future = [];
  if (state.past.length > 50) state.past.shift();
  state.pristine = false;
  save();
  updateHistoryButtons();
}

function applySnapshot(snap) {
  state.room = structuredClone(snap.room);
  state.pieces = snap.pieces.map((p) => ({ ...p }));
  state.selectedId = snap.selectedId;
  state.mode = snap.mode || state.mode;
  state.libraryId = snap.libraryId || null;
  normalize(state.room, state.pieces);
}

function undo() {
  if (!state.past.length) return;
  state.future.push(snapshot());
  applySnapshot(state.past.pop());
  save();
  sync();
}

function redo() {
  if (!state.future.length) return;
  state.past.push(snapshot());
  applySnapshot(state.future.pop());
  save();
  sync();
}

function save() {
  const data = {
    version: 1,
    room: state.room,
    pieces: state.pieces,
    mode: state.mode,
    view: state.view,
    corner: state.corner,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    selectedId: state.selectedId,
    pristine: state.pristine,
    units: state.units,
    libraryId: state.libraryId,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    state.saveError = "";
  } catch {
    state.saveError = "This browser ran out of room to keep the photos. The layout still works in this tab.";
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.room || !Array.isArray(data.pieces)) return null;
    return data;
  } catch {
    return null;
  }
}

function loadLibrary() {
  try {
    const raw = localStorage.getItem(ROOMS_KEY);
    const data = raw ? JSON.parse(raw) : [];
    state.library = Array.isArray(data) ? data.filter((r) => r && r.id && r.room && Array.isArray(r.pieces)) : [];
  } catch {
    state.library = [];
  }
}

function writeLibrary(rooms) {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
}

function roomRecord(id) {
  return {
    id,
    name: state.room.name || "Room",
    savedAt: Date.now(),
    units: state.units,
    mode: state.mode,
    view: state.view,
    corner: state.corner,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    selectedId: state.selectedId,
    room: structuredClone(state.room),
    pieces: state.pieces.map((p) => ({ ...p })),
  };
}

function saveRoomToLibrary() {
  const id = state.libraryId || uid();
  const record = roomRecord(id);
  const store = (entry) => {
    const next = [entry, ...state.library.filter((r) => r.id !== entry.id)];
    writeLibrary(next);
    state.library = next;
    state.libraryId = entry.id;
  };
  try {
    store(record);
    state.saveError = "";
  } catch {
    const slim = { ...record, pieces: record.pieces.map((p) => ({ ...p, photo: null })) };
    try {
      store(slim);
      state.saveError = "Saved the room. The photos didn’t fit in this browser, so this copy is without them.";
    } catch {
      state.saveError = "This browser ran out of room to keep another copy.";
    }
  }
  save();
  renderLibrary();
  renderNotes();
}

function openSavedRoom(id) {
  const record = state.library.find((r) => r.id === id);
  if (!record) return;
  const before = snapshot();
  state.past.push(before);
  state.future = [];
  if (record.units === "metric" || record.units === "us") state.units = record.units;
  applyDocument({ ...record, pristine: false });
  state.libraryId = record.id;
  state.pristine = false;
  save();
  sync();
}

function deleteSavedRoom(id) {
  const next = state.library.filter((r) => r.id !== id);
  try {
    writeLibrary(next);
    state.library = next;
    if (state.libraryId === id) state.libraryId = null;
    state.saveError = "";
    save();
  } catch {
    state.saveError = "Couldn’t update the saved rooms.";
  }
  renderLibrary();
  renderNotes();
}

function savedWhen(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderLibrary() {
  const ul = document.getElementById("saved-rooms");
  const button = document.getElementById("save-room");
  const known = state.library.some((r) => r.id === state.libraryId);
  button.textContent = known ? "Update saved room" : "Save this room";
  ul.replaceChildren();
  if (!state.library.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing saved yet.";
    ul.append(li);
    return;
  }
  for (const record of state.library) {
    const li = document.createElement("li");
    li.className = "saved-room" + (record.id === state.libraryId ? " current" : "");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "piece";
    open.setAttribute("aria-label", `Open ${record.name || "Room"}`);
    const meta = document.createElement("span");
    meta.className = "meta";
    const name = document.createElement("strong");
    name.textContent = record.name || "Room";
    const small = document.createElement("small");
    small.textContent = `${fmtRoom(record.room.w)} × ${fmtRoom(record.room.d)} · ${savedWhen(record.savedAt)}`;
    meta.append(name, small);
    open.append(meta);
    open.addEventListener("click", () => openSavedRoom(record.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${record.name || "Room"}`);
    remove.addEventListener("click", () => deleteSavedRoom(record.id));
    li.append(open, remove);
    ul.append(li);
  }
}

function applyDocument(doc) {
  state.room = structuredClone(doc.room);
  state.pieces = doc.pieces.map((p) => ({ photo: null, ...p }));
  state.mode = doc.mode === "fit" ? "fit" : "flow";
  state.view = doc.view || "plan";
  state.corner = doc.corner || 0;
  state.zoom = doc.zoom || 1;
  state.panX = doc.panX || 0;
  state.panY = doc.panY || 0;
  state.selectedId = doc.selectedId || null;
  state.pristine = !!doc.pristine;
  normalize(state.room, state.pieces);
  if (state.selectedId && !state.pieces.some((p) => p.id === state.selectedId)) state.selectedId = null;
}

/* ---------- placement ---------- */

function placeAgainst(room, wall, rot, t, fp) {
  if (wall === "n") return { x: t, y: 0, rot };
  if (wall === "s") return { x: t, y: room.d - fp.d, rot };
  if (wall === "w") return { x: 0, y: t, rot };
  return { x: room.w - fp.w, y: t, rot };
}

function along(limit) {
  if (limit < 0) return [];
  const pts = [];
  for (let t = 0; t <= limit + 0.01; t += 6) pts.push(Math.min(limit, Math.round(t)));
  if (pts[pts.length - 1] !== limit) pts.push(limit);
  return [...new Set(pts)];
}

function wallCandidates(room, piece) {
  const out = [];
  const rotOf = { n: 0, e: 90, s: 180, w: 270 };
  for (const wall of WALLS) {
    const rot = rotOf[wall];
    const fp = footprint(piece, rot);
    const limit = wall === "n" || wall === "s" ? room.w - fp.w : room.d - fp.d;
    for (const t of along(limit)) out.push(placeAgainst(room, wall, rot, t, fp));
  }
  return out;
}

function candidates(room, piece) {
  const out = wallCandidates(room, piece);
  if (piece.type === "dining" || piece.type === "armchair" || piece.type === "coffee") {
    for (const rot of [0, 90]) {
      const fp = footprint(piece, rot);
      for (let y = 0; y <= room.d - fp.d; y += 12) {
        for (let x = 0; x <= room.w - fp.w; x += 12) out.push({ x, y, rot });
      }
    }
  }
  return out;
}

function pairOk(a, b) {
  const t = new Set([a, b]);
  return (t.has("nightstand") && t.has("bed")) || (t.has("chair") && t.has("desk")) || (t.has("coffee") && t.has("sofa"));
}

function nightstandSlots(bed, ns) {
  const b = bounds(bed);
  const rot = bed.rot || 0;
  const fp = footprint(ns, rot);
  if (rot === 0) return [{ x: b.x - fp.w, y: b.y, rot }, { x: b.x + b.w, y: b.y, rot }];
  if (rot === 180) {
    const y = b.y + b.d - fp.d;
    return [{ x: b.x - fp.w, y, rot }, { x: b.x + b.w, y, rot }];
  }
  if (rot === 270) return [{ x: b.x, y: b.y - fp.d, rot }, { x: b.x, y: b.y + b.d, rot }];
  const x = b.x + b.w - fp.w;
  return [{ x, y: b.y - fp.d, rot }, { x, y: b.y + b.d, rot }];
}

function chairSlot(desk, chair) {
  const b = bounds(desk);
  const rot = (desk.rot + 180) % 360;
  const fp = footprint(chair, rot);
  if (desk.rot === 0) return { x: b.x + (b.w - fp.w) / 2, y: b.y + b.d, rot };
  if (desk.rot === 180) return { x: b.x + (b.w - fp.w) / 2, y: b.y - fp.d, rot };
  if (desk.rot === 270) return { x: b.x + b.w, y: b.y + (b.d - fp.d) / 2, rot };
  return { x: b.x - fp.w, y: b.y + (b.d - fp.d) / 2, rot };
}

function coffeeSlot(sofa, coffee) {
  const b = bounds(sofa);
  const rot = sofa.rot % 180 === 0 ? 0 : 90;
  const fp = footprint({ ...coffee, w: coffee.w, d: coffee.d }, rot);
  const gap = 12;
  if (sofa.rot === 0) return { x: b.x + (b.w - fp.w) / 2, y: b.y + b.d + gap, rot };
  if (sofa.rot === 180) return { x: b.x + (b.w - fp.w) / 2, y: b.y - gap - fp.d, rot };
  if (sofa.rot === 270) return { x: b.x + b.w + gap, y: b.y + (b.d - fp.d) / 2, rot };
  return { x: b.x - gap - fp.w, y: b.y + (b.d - fp.d) / 2, rot };
}

function hitsZones(box, room, kind) {
  const doors = room.doors || [];
  const swing = doors.some((d) => overlapArea(box, swingRectFor(room, d)) > 0);
  const path = doors.some((d) => overlapArea(box, pathRectFor(room, d)) > 0);
  const closet = closetZones(room).some((z) => overlapArea(box, z) > 0);
  if (kind === "rug") return { swing: false, path: false, closet };
  return { swing, path, closet };
}

function scoreSpot(room, placed, piece, spot, mode, pending) {
  const box = bounds({ ...piece, ...spot });
  if (!inside(room, box)) return -1e12;
  let s = 30;
  let minGap = Infinity;
  for (const other of placed) {
    if (other.type === "rug" || other.id === piece.id) continue;
    const o = bounds(other);
    const area = overlapArea(box, o);
    if (area > 0) s -= 100000 + area;
    else if (pairOk(piece.type, other.type)) s += Math.max(0, 90 - gapBetween(box, o));
    else minGap = Math.min(minGap, gapBetween(box, o));
  }
  if (minGap < 14) s -= (14 - minGap) * 28;

  const zones = hitsZones(box, room, piece.type);
  if (zones.swing) s -= 50000;
  else if (zones.path) s -= 6000;
  if (zones.closet) s -= 7000;

  const wall = wallFromRot(spot.rot);
  const door = entryDoor(room);
  const doorW = door && door.wall;
  const onWall = distanceToWall(box, wall, room) < 6;

  if (piece.type === "bed") s += scoreBed(room, box, wall, mode);
  else if (piece.type === "desk") s += scoreDesk(room, { ...piece, ...spot }, placed, pending, mode);
  else if (piece.type === "sofa") {
    if (doorW && wall === doorW) s -= 350;
    if (onWall) s += 180;
    const bed = placed.find((p) => p.type === "bed");
    if (bed && wallFromRot(bed.rot) !== wall) s += 80;
  } else if (piece.type === "dresser" || piece.type === "bookshelf" || piece.type === "tv") {
    if (doorW && wall === doorW) s -= 200;
    if (onWall) s += 80;
    if (piece.type === "bookshelf" && windowOn(room, box, wall)) s -= 320;
    if (piece.type === "dresser" && windowOn(room, box, wall)) s -= 70;
    if (piece.type === "tv") {
      const seat = placed.find((p) => p.type === "sofa") || placed.find((p) => p.type === "bed");
      if (seat && wall === OPP[wallFromRot(seat.rot)]) s += 420;
    }
    const bed = placed.find((p) => p.type === "bed");
    if (bed && wall !== wallFromRot(bed.rot)) s += 70;
  } else if (piece.type === "armchair") {
    if (onWall) {
      s += 260;
      if (doorW && wall !== doorW && wall !== OPP[doorW]) s += 80;
    }
    if (zones.path) s -= 2000;
  } else if (piece.type === "dining") {
    const cx = box.x + box.w / 2 - room.w / 2;
    const cy = box.y + box.d / 2 - room.d / 2;
    s += 260 - Math.hypot(cx, cy) / 2;
  } else if (piece.type === "plant") {
    const corner = (box.x < 8 || room.w - (box.x + box.w) < 8) && (box.y < 8 || room.d - (box.y + box.d) < 8);
    if (corner) s += 240;
  } else if (piece.type === "tub" || piece.type === "toilet" || piece.type === "vanity") {
    if (onWall) s += 240;
    if (doorW && wall === doorW) s -= 400;
  }

  const anchored = ["bed", "sofa", "desk", "dresser", "bookshelf", "tv", "armchair", "nightstand", "tub", "toilet", "vanity"].includes(piece.type);
  if (anchored && !onWall) s -= 2500;

  if (piece.type === "bed") {
    const stands = pending.filter((p) => p.type === "nightstand");
    if (stands.length) s += nightstandRoom(room, { ...piece, ...spot }, stands[0], placed, stands.length);
  }
  return s;
}

function scoreBed(room, box, wall, mode) {
  let s = 0;
  const door = entryDoor(room);
  if (door) {
    const doorW = door.wall;
    if (wall === doorW) s -= 700;
    const aligned = wall === OPP[doorW] && spanOverlap(box, door);
    if (mode === "flow") {
      if (aligned) s -= 900;
      else if (wall !== doorW && OPP[wall] !== doorW) s += 720;
      else if (wall !== doorW) s += 220;
    } else if (aligned) s -= 180;
  }
  if (mode === "flow") {
    if (windowOn(room, box, wall)) s -= 860;
    else s += 80;
  } else {
    if (windowOn(room, box, wall)) s -= 240;
    s += wallLen(room, wall) / 6;
  }
  return s;
}

function nightstandRoom(room, bed, ns, placed, count) {
  let ok = 0;
  for (const slot of nightstandSlots(bed, ns)) {
    const box = bounds({ ...ns, ...slot });
    if (!inside(room, box)) continue;
    if (hitsZones(box, room).swing || hitsZones(box, room).closet) continue;
    if (placed.some((p) => p.type !== "rug" && overlapArea(bounds(p), box) > 0)) continue;
    ok += 1;
  }
  if (count >= 2) return ok * 380;
  return ok ? 380 : 0;
}

function scoreDesk(room, desk, placed, pending, mode) {
  let s = 0;
  const wall = wallFromRot(desk.rot);
  const door = entryDoor(room);
  const doorW = door && door.wall;
  if (doorW && wall === doorW) s -= 400;
  if (doorW && mode === "flow") {
    if (wall === OPP[doorW]) s -= 260;
    else if (wall !== doorW) s += 520;
  }
  const box = bounds(desk);
  const corner = (box.x < 8 || room.w - (box.x + box.w) < 8) && (box.y < 8 || room.d - (box.y + box.d) < 8);
  if (corner) s += 90;
  if (windowOn(room, box, wall)) s += 50;
  const chair = pending.find((p) => p.type === "chair") || placed.find((p) => p.type === "chair");
  if (chair) {
    const slot = chairSlot(desk, chair);
    const cbox = bounds({ ...chair, ...slot });
    if (!inside(room, cbox)) s -= 500;
    else if (hitsZones(cbox, room).swing) s -= 4000;
    else s += 240;
  }
  return s;
}

function bestOf(room, placed, piece, spots, mode, pending) {
  let best = null;
  let bestScore = -Infinity;
  for (const spot of spots) {
    const score = scoreSpot(room, placed, piece, spot, mode, pending) + (spot.bias || 0);
    if (score > bestScore) {
      bestScore = score;
      best = spot;
    }
  }
  return best ? { x: best.x, y: best.y, rot: best.rot } : { x: 0, y: 0, rot: 0 };
}

function takeAll(pool, type) {
  const got = pool.filter((p) => p.type === type);
  for (const piece of got) pool.splice(pool.indexOf(piece), 1);
  got.sort((a, b) => b.w * b.d - a.w * a.d);
  return got;
}

function placePiece(room, placed, piece, mode, pool, preferred) {
  const spots = (preferred || []).map((spot) => ({ ...spot, bias: 700 })).concat(candidates(room, piece));
  const pos = bestOf(room, placed, piece, spots, mode, pool);
  placed.push({ ...piece, ...pos });
}

function companionSpots(room, placed, piece) {
  if (piece.type === "nightstand") {
    return placed.filter((p) => p.type === "bed").flatMap((bed) => nightstandSlots(bed, piece));
  }
  if (piece.type === "chair") {
    const desk = placed.find((p) => p.type === "desk");
    return desk ? [chairSlot(desk, piece)] : [];
  }
  if (piece.type === "coffee") {
    const sofa = placed.find((p) => p.type === "sofa");
    return sofa ? [coffeeSlot(sofa, piece)] : [];
  }
  return [];
}

function placeRug(room, placed, rug) {
  const anchor = placed.find((p) => p.type === "bed") || placed.find((p) => p.type === "sofa");
  if (!anchor) return { x: 6, y: 6, rot: 0 };
  const b = bounds(anchor);
  let rot = 0;
  const rugLong = rug.w >= rug.d;
  const bedLong = b.w >= b.d;
  if (rugLong !== bedLong) rot = 90;
  let fp = footprint(rug, rot);
  if (fp.w > room.w - 8 || fp.d > room.d - 8) {
    const sx = (room.w - 8) / fp.w;
    const sy = (room.d - 8) / fp.d;
    const sc = Math.min(1, sx, sy);
    rug.w = Math.max(24, Math.round(rug.w * sc));
    rug.d = Math.max(24, Math.round(rug.d * sc));
    fp = footprint(rug, rot);
  }
  let x = b.x + (b.w - fp.w) / 2;
  let y = b.y + (b.d - fp.d) / 2;
  // Leave the headboard wall a couple of inches bare.
  const back = wallFromRot(anchor.rot);
  if (back === "n") y += 4;
  if (back === "s") y -= 4;
  if (back === "w") x += 4;
  if (back === "e") x -= 4;
  x = clamp(x, 0, Math.max(0, room.w - fp.w));
  y = clamp(y, 0, Math.max(0, room.d - fp.d));
  return { x: Math.round(x), y: Math.round(y), rot };
}

function arrange(room, pieces, mode) {
  const pool = pieces.map((p) => ({ ...p }));
  const placed = [];
  const placeAll = (type, prefer) => {
    for (const piece of takeAll(pool, type)) {
      const preferred = prefer ? prefer(piece) : [];
      placePiece(room, placed, piece, mode, pool, preferred);
    }
  };
  // Anchors first, then the pieces that belong against them, so a bookshelf
  // can't steal the floor a nightstand was being saved for.
  placeAll("tub");
  placeAll("toilet");
  placeAll("vanity");
  placeAll("bed");
  placeAll("nightstand", (piece) => companionSpots(room, placed, piece));
  placeAll("sofa");
  placeAll("coffee", (piece) => companionSpots(room, placed, piece));
  placeAll("desk");
  placeAll("chair", (piece) => companionSpots(room, placed, piece));
  for (const type of ["armchair", "dresser", "bookshelf", "tv", "dining"]) placeAll(type);
  for (const piece of pool.filter((p) => p.type !== "rug" && p.type !== "plant")) {
    placePiece(room, placed, piece, mode, pool, []);
  }
  pool.splice(0, pool.length, ...pool.filter((p) => p.type === "rug" || p.type === "plant"));
  placeAll("plant");
  for (const piece of takeAll(pool, "rug")) placed.push({ ...piece, ...placeRug(room, placed, piece) });
  const byId = new Map(placed.map((p) => [p.id, p]));
  return pieces.map((p) => byId.get(p.id) || { ...p });
}

/* ---------- advice ---------- */

function overlapsOf(pieces) {
  const hits = [];
  const solid = pieces.filter((p) => p.type !== "rug");
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (overlapArea(bounds(solid[i]), bounds(solid[j])) > 0) hits.push([solid[i], solid[j]]);
    }
  }
  return hits;
}

function collectNotes() {
  const room = state.room;
  const pieces = state.pieces;
  const notes = [];
  if (state.pristine) {
    notes.push({
      tone: "info",
      text: room.project === "remodel"
        ? `This is a sample bath, ${fmtRoom(room.w)} by ${fmtRoom(room.d)}. The list on the side is what the tile and the fixtures add up to. Change the sizes to your room.`
        : `This is a sample front bedroom, ${fmtRoom(room.w)} by ${fmtRoom(room.d)}. Change the measurements to your room, then drag anything that isn’t yours.`,
    });
  }
  if (!pieces.length) {
    notes.push({
      tone: "info",
      text: room.project === "remodel"
        ? "Add a tub, a toilet, or a vanity, or load the sample bath."
        : "Add what you actually own, or load the sample bedroom and start replacing it.",
    });
  }
  for (const [a, b] of overlapsOf(pieces)) {
    notes.push({ tone: "bad", text: `${a.name} overlaps ${b.name}.` });
  }
  for (const p of pieces) {
    const b = bounds(p);
    if (b.w > room.w + 0.5 || b.d > room.d + 0.5) {
      notes.push({ tone: "bad", text: `${p.name} is bigger than the room on one side.` });
    }
    const widest = room.doors.reduce((m, d) => Math.max(m, d.width), 0);
    if (widest && p.type !== "bed" && p.type !== "sofa" && p.type !== "rug" && Math.min(p.w, p.d) > widest) {
      notes.push({ tone: "warn", text: `${p.name} is wider than the doorway on both sides, so it may not come through in one piece.` });
    }
  }
  const blockers = pieces.filter((p) => p.type !== "rug" && hitsZones(bounds(p), room, p.type).swing);
  if (room.doors.length && blockers.length) {
    notes.push({ tone: "bad", text: `${blockers.map((p) => p.name).join(" and ")} ${blockers.length > 1 ? "are" : "is"} in the door swing.` });
  } else if (room.doors.length && pieces.length) {
    notes.push({ tone: "good", text: room.doors.length > 1 ? "The doors can swing open." : "The door can swing open." });
  }
  const pathBlock = pieces.filter((p) => {
    if (p.type === "rug") return false;
    const zones = hitsZones(bounds(p), room, p.type);
    return zones.path && !zones.swing;
  });
  if (pathBlock.length) {
    notes.push({ tone: "warn", text: `${pathBlock.map((p) => p.name).join(" and ")} sit in the path in from the door.` });
  }
  for (const closet of room.closets) {
    const zone = zoneRect(room, closet, closet.kind === "sliding" ? 18 : closet.width);
    const who = pieces.filter((p) => p.type !== "rug" && overlapArea(bounds(p), zone) > 0);
    if (who.length) notes.push({ tone: "warn", text: `${who.map((p) => p.name).join(" and ")} block the closet.` });
  }

  for (const bed of pieces.filter((p) => p.type === "bed")) {
    const wall = wallFromRot(bed.rot);
    const box = bounds(bed);
    const near = distanceToWall(box, wall, room) < 8;
    if (!near) {
      notes.push({ tone: "warn", text: `${bed.name} isn’t against a wall. The dark edge is the headboard — turn it until that edge meets one.` });
    } else if (state.mode === "flow") {
      const door = entryDoor(room);
      if (door) {
        const doorW = door.wall;
        if (wall === doorW) notes.push({ tone: "warn", text: `${bed.name} is on the same wall as the door, so you can’t see the door from the pillows.` });
        else if (wall === OPP[doorW] && spanOverlap(box, door)) notes.push({ tone: "warn", text: `${bed.name} lines up with the door. That’s the spot feng shui books call the coffin position.` });
        else notes.push({ tone: "good", text: `From ${bed.name} you can see the door, and you aren’t aimed straight at it.` });
      }
      if (windowOn(room, box, wall)) notes.push({ tone: "warn", text: `The headboard of ${bed.name} is under a window. A solid wall behind it usually feels calmer.` });
    } else if (windowOn(room, box, wall)) {
      notes.push({ tone: "info", text: `${bed.name} sits under a window.` });
    }
    const stands = pieces.filter((p) => p.type === "nightstand");
    const beside = stands.filter((ns) => gapBetween(bounds(ns), box) < 8 && overlapArea(bounds(ns), box) === 0);
    if (stands.length >= 2 && beside.length >= 2) notes.push({ tone: "good", text: "Both sides of the bed have a nightstand." });
    else if (stands.length && !beside.length) notes.push({ tone: "info", text: "The nightstand isn’t beside the bed yet." });
  }

  for (const desk of pieces.filter((p) => p.type === "desk")) {
    const wall = wallFromRot(desk.rot);
    const door = entryDoor(room);
    const doorW = door && door.wall;
    if (doorW && state.mode === "flow") {
      if (wall === OPP[doorW]) notes.push({ tone: "warn", text: "The desk faces the wall opposite the door, which puts the door at your back." });
      else if (wall !== doorW) notes.push({ tone: "good", text: "The desk is on a side wall, so the door isn’t directly behind you." });
    }
    const chair = pieces.find((p) => p.type === "chair");
    if (chair) {
      const gap = gapBetween(bounds(chair), bounds(desk));
      if (gap > 30) notes.push({ tone: "info", text: "The desk chair is a ways from the desk." });
    }
  }

  if (pieces.length) {
    const cover = pieces.filter((p) => p.type !== "rug").reduce((sum, p) => sum + p.w * p.d, 0);
    const pct = Math.round((cover / (room.w * room.d)) * 100);
    const tone = pct > 60 ? "warn" : "info";
    const extra = pct > 60 ? " That’s a full room — a clear path will matter more than one more piece." : "";
    const word = room.project === "remodel" ? "Fixtures cover" : "Furniture covers";
    notes.push({ tone, text: `${word} ${pct}% of the floor.${extra}` });
  }

  if (state.saveError) notes.push({ tone: "warn", text: state.saveError });

  if (room.project !== "remodel") {
    const disclaimer = state.mode === "flow"
      ? "Flow uses a few widely repeated feng shui habits: see the door from the bed, keep a solid wall behind the headboard, put the desk so the door isn’t at your back, and leave the doorway clear. It’s a layout aid, not a reading."
      : "Fit keeps the door usable, puts the bed on a wall, and tries to leave room to actually use each piece.";
    notes.push({ tone: "info", text: disclaimer });
  }

  const rank = { bad: 0, warn: 1, good: 2, info: 3 };
  const body = notes.filter((n) => n.tone !== "info").sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 7);
  const info = notes.filter((n) => n.tone === "info");
  return body.concat(info.slice(0, 2));
}

/* ---------- drawing ---------- */

function cssSize() {
  return { w: canvas.clientWidth, h: canvas.clientHeight };
}

function resizeCanvas() {
  const { w, h } = cssSize();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function planMargin(w, h) {
  return Math.min(w, h) < 560 ? 36 : 88;
}

function camera() {
  const { w, h } = cssSize();
  const room = state.room;
  const margin = planMargin(w, h);
  const fit = Math.min((w - margin * 2) / room.w, (h - margin * 2) / room.d);
  const scale = fit * state.zoom;
  return {
    scale,
    originX: (w - room.w * scale) / 2 + state.panX,
    originY: (h - room.d * scale) / 2 + state.panY,
    w,
    h,
  };
}

function toRoom(mx, my, cam) {
  return { x: (mx - cam.originX) / cam.scale, y: (my - cam.originY) / cam.scale };
}

function R(cam, x, y) {
  return [cam.originX + x * cam.scale, cam.originY + y * cam.scale];
}

function roundRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function ensureHatch() {
  if (hatch) return hatch;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const g = c.getContext("2d");
  g.strokeStyle = "rgba(161, 38, 34, 0.55)";
  g.beginPath();
  g.moveTo(0, 8);
  g.lineTo(8, 0);
  g.stroke();
  hatch = ctx.createPattern(c, "repeat");
  return hatch;
}

function imageFor(piece) {
  if (!piece.photo) return null;
  let rec = images.get(piece.id);
  if (!rec || rec.src !== piece.photo) {
    const img = new Image();
    rec = { src: piece.photo, img, ready: false };
    img.onload = () => {
      rec.ready = true;
      draw();
    };
    img.src = piece.photo;
    images.set(piece.id, rec);
  }
  return rec.ready ? rec.img : null;
}

function drawCover(img, x, y, w, h) {
  const ir = img.width / img.height;
  const r = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > r) {
    sw = sh * r;
    sx = (img.width - sw) / 2;
  } else {
    sh = sw / r;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function openingIntervals(room, wall) {
  const list = [];
  for (const op of allOpenings(room)) {
    if (op.wall === wall) list.push([op.offset, op.offset + op.width]);
  }
  list.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of list) {
    if (!merged.length || iv[0] > merged[merged.length - 1][1]) merged.push([iv[0], iv[1]]);
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
  }
  return merged;
}

function swingAngles(door) {
  const start = door.hinge !== "end";
  // Screen angles: 0 east, increasing toward south.
  const table = {
    s: start ? [0, -Math.PI / 2] : [Math.PI, Math.PI * 1.5],
    n: start ? [0, Math.PI / 2] : [Math.PI, Math.PI / 2],
    e: start ? [Math.PI / 2, Math.PI] : [-Math.PI / 2, -Math.PI],
    w: start ? [Math.PI / 2, 0] : [-Math.PI / 2, 0],
  };
  return table[door.wall];
}

function hingePoint(room, opening) {
  const start = opening.hinge !== "end";
  if (opening.wall === "n") return [start ? opening.offset : opening.offset + opening.width, 0];
  if (opening.wall === "s") return [start ? opening.offset : opening.offset + opening.width, room.d];
  if (opening.wall === "w") return [0, start ? opening.offset : opening.offset + opening.width];
  return [room.w, start ? opening.offset : opening.offset + opening.width];
}

function drawPlan() {
  const room = state.room;
  const cam = camera();
  const { w, h } = cam;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#e7e0d4";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = floorColor(room);
  ctx.fillRect(cam.originX, cam.originY, room.w * cam.scale, room.d * cam.scale);

  ctx.save();
  ctx.beginPath();
  ctx.rect(cam.originX, cam.originY, room.w * cam.scale, room.d * cam.scale);
  ctx.clip();
  const finish = floorFinish(room);
  for (const [step, color, width] of gridSteps(finish, cam.scale)) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    const nx = Math.floor(room.w / step);
    const ny = Math.floor(room.d / step);
    for (let i = 0; i <= nx; i++) {
      const [px] = R(cam, i * step, 0);
      ctx.moveTo(px, cam.originY);
      ctx.lineTo(px, cam.originY + room.d * cam.scale);
    }
    for (let i = 0; i <= ny; i++) {
      const [, py] = R(cam, 0, i * step);
      ctx.moveTo(cam.originX, py);
      ctx.lineTo(cam.originX + room.w * cam.scale, py);
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(184, 67, 47, 0.09)";
  for (const door of room.doors) {
    const swing = swingRectFor(room, door);
    const [sx, sy] = R(cam, swing.x, swing.y);
    ctx.fillRect(sx, sy, swing.w * cam.scale, swing.d * cam.scale);
  }
  for (const zone of closetZones(room)) {
    ctx.fillStyle = "rgba(70, 90, 110, 0.08)";
    const [zx, zy] = R(cam, zone.x, zone.y);
    ctx.fillRect(zx, zy, zone.w * cam.scale, zone.d * cam.scale);
  }
  ctx.restore();

  const ordered = [...state.pieces].sort((a, b) => {
    if (a.type === "rug" && b.type !== "rug") return -1;
    if (b.type === "rug" && a.type !== "rug") return 1;
    if (a.id === state.selectedId) return 1;
    if (b.id === state.selectedId) return -1;
    return 0;
  });
  for (const piece of ordered) drawPiece(piece, cam);

  drawSwingArc(cam);
  drawWallsStroke(cam);
  drawOutsideOpenings(cam);
  drawPlanLabels(cam);
  if (state.selectedId && state.view === "plan") drawHandle(cam);
}

function drawPiece(piece, cam) {
  const box = bounds(piece);
  const x = cam.originX + box.x * cam.scale;
  const y = cam.originY + box.y * cam.scale;
  const pw = box.w * cam.scale;
  const ph = box.d * cam.scale;
  const color = COLOR[piece.type] || "#8a7564";
  const selected = piece.id === state.selectedId;
  const overlap = piece.type !== "rug" && state.pieces.some((o) => o.id !== piece.id && o.type !== "rug" && overlapArea(bounds(o), box) > 0);

  if (piece.type === "plant") {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + pw / 2, y + ph / 2, Math.min(pw, ph) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    labelPiece(piece, x, y, pw, ph, "#f7f3eb", false);
    if (selected || overlap) {
      ctx.beginPath();
      ctx.arc(x + pw / 2, y + ph / 2, Math.min(pw, ph) / 2, 0, Math.PI * 2);
      ctx.strokeStyle = overlap ? "#a12622" : "#b8432f";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    return;
  }

  ctx.save();
  ctx.shadowColor = "rgba(60, 40, 20, 0.18)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  roundRect(x, y, pw, ph, 5);
  ctx.fillStyle = piece.type === "rug" ? "rgba(196, 120, 90, 0.88)" : color;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(x, y, pw, ph, 5);
  ctx.clip();
  const img = imageFor(piece);
  if (img) {
    drawCover(img, x, y, pw, ph);
    ctx.fillStyle = "rgba(28, 22, 16, 0.28)";
    ctx.fillRect(x, y + ph * 0.62, pw, ph * 0.38);
  }
  if (piece.type !== "rug") {
    ctx.fillStyle = shade(color, -0.28);
    const band = Math.max(5, Math.min(pw, ph) * 0.16);
    if (piece.rot === 0) ctx.fillRect(x, y, pw, band);
    else if (piece.rot === 180) ctx.fillRect(x, y + ph - band, pw, band);
    else if (piece.rot === 270) ctx.fillRect(x, y, band, ph);
    else ctx.fillRect(x + pw - band, y, band, ph);
    drawFixtureGlyph(piece, x, y, pw, ph, band);
  } else {
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 5, y + 5, pw - 10, ph - 10);
  }
  if (overlap) {
    ctx.fillStyle = ensureHatch();
    ctx.fillRect(x, y, pw, ph);
  }
  ctx.restore();

  if (piece.type !== "rug") drawFacingMark(piece, box, cam);
  labelPiece(piece, x, y, pw, ph, img ? "#f7f3eb" : inkFor(color), !!img);
  if (selected || overlap) {
    ctx.save();
    roundRect(x, y, pw, ph, 5);
    ctx.strokeStyle = overlap ? "#a12622" : "#b8432f";
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

function floorFinish(room) {
  if (!room || room.project !== "remodel" || !room.remodel) return "keep";
  return room.remodel.floor || "keep";
}

function floorColor(room) {
  const finish = floorFinish(room);
  if (finish === "tile") return "#d5ddd8";
  if (finish === "vinyl") return "#d4c7ae";
  return "#e4d2b0";
}

function gridSteps(finish, scale) {
  if (!metric()) {
    const levels = [];
    if (finish === "keep" && scale >= 8) levels.push([1, "rgba(120, 90, 50, 0.16)", 1]);
    if (finish !== "tile" && scale >= 1.1) levels.push([6, "rgba(120, 90, 50, 0.22)", 1]);
    levels.push([12, finish === "tile" ? "rgba(70, 90, 80, 0.45)" : "rgba(90, 60, 30, 0.42)", 1.25]);
    return levels;
  }
  const levels = [];
  if (finish !== "tile" && scale * cmToIn(10) >= 7) levels.push([cmToIn(10), "rgba(120, 90, 50, 0.16)", 1]);
  if (finish !== "tile" && scale * cmToIn(50) >= 6) levels.push([cmToIn(50), "rgba(120, 90, 50, 0.28)", 1]);
  const major = finish === "tile" ? cmToIn(30) : cmToIn(100);
  levels.push([major, finish === "tile" ? "rgba(70, 90, 80, 0.45)" : "rgba(90, 60, 30, 0.42)", 1.25]);
  return levels;
}

function drawFixtureGlyph(piece, x, y, pw, ph, band) {
  if (piece.type !== "tub" && piece.type !== "toilet" && piece.type !== "vanity") return;
  let fx = x;
  let fy = y;
  let fw = pw;
  let fh = ph;
  if (piece.rot === 0) { fy += band; fh -= band; }
  else if (piece.rot === 180) { fh -= band; }
  else if (piece.rot === 270) { fx += band; fw -= band; }
  else { fw -= band; }
  const pad = Math.min(fw, fh) * 0.14;
  ctx.fillStyle = piece.type === "vanity" ? "#f4f1ea" : "#f7fbff";
  ctx.strokeStyle = "rgba(40, 50, 60, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (piece.type === "vanity") {
    ctx.arc(fx + fw / 2, fy + fh / 2, Math.max(2, Math.min(fw, fh) * 0.22), 0, Math.PI * 2);
  } else {
    ctx.ellipse(fx + fw / 2, fy + fh / 2, Math.max(2, fw / 2 - pad), Math.max(2, fh / 2 - pad), 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}

function drawFacingMark(piece, box, cam) {
  let bx;
  let by;
  if (piece.rot === 0) { bx = box.x + box.w / 2; by = box.y; }
  else if (piece.rot === 180) { bx = box.x + box.w / 2; by = box.y + box.d; }
  else if (piece.rot === 90) { bx = box.x + box.w; by = box.y + box.d / 2; }
  else { bx = box.x; by = box.y + box.d / 2; }
  const [px, py] = R(cam, bx, by);
  const [fx, fy] = frontVector(piece.rot);
  ctx.beginPath();
  ctx.moveTo(px + fx * 11, py + fy * 11);
  ctx.lineTo(px - fy * 5, py + fx * 5);
  ctx.lineTo(px + fy * 5, py - fx * 5);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();
}

function labelPiece(piece, x, y, pw, ph, color, photo) {
  if (pw < 46 || ph < 28) return;
  const cy = photo ? y + ph * 0.78 : y + ph / 2 - (ph > 46 ? 7 : 0);
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.min(14, pw / 8)}px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.fillText(piece.name, x + pw / 2, cy, pw - 10);
  if (!photo && ph > 46 && pw > 70) {
    ctx.font = `12px "Avenir Next", "Segoe UI", sans-serif`;
    ctx.fillText(fmtPair(piece.w, piece.d), x + pw / 2, y + ph / 2 + 10, pw - 10);
  }
  ctx.restore();
}

function drawSwingArc(cam) {
  ctx.save();
  ctx.strokeStyle = "rgba(120, 60, 40, 0.8)";
  ctx.fillStyle = "rgba(184, 67, 47, 0.05)";
  ctx.lineWidth = 1.25;
  for (const door of state.room.doors) {
    const [hx, hy] = hingePoint(state.room, door);
    const [a0, a1] = swingAngles(door);
    const [px, py] = R(cam, hx, hy);
    const r = door.width * cam.scale;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, r, a0, a1, a1 < a0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, r, a0, a1, a1 < a0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a1) * r, py + Math.sin(a1) * r);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWallsStroke(cam) {
  const room = state.room;
  ctx.save();
  ctx.strokeStyle = "#2c261f";
  ctx.lineWidth = 4;
  ctx.lineCap = "square";
  ctx.beginPath();
  for (const wall of WALLS) {
    const len = wallLen(room, wall);
    let cursor = 0;
    const holes = openingIntervals(room, wall);
    const emit = (a, b) => {
      if (b - a < 1) return;
      const seg = segment(room, wall, a, b);
      const [x1, y1] = R(cam, seg[0], seg[1]);
      const [x2, y2] = R(cam, seg[2], seg[3]);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    };
    for (const [a, b] of holes) {
      emit(cursor, a);
      cursor = b;
    }
    emit(cursor, len);
  }
  ctx.stroke();
  ctx.restore();
}

function segment(room, wall, a, b) {
  if (wall === "n") return [a, 0, b, 0];
  if (wall === "s") return [a, room.d, b, room.d];
  if (wall === "w") return [0, a, 0, b];
  return [room.w, a, room.w, b];
}

function drawOutsideOpenings(cam) {
  const room = state.room;
  ctx.save();
  ctx.fillStyle = "#d5e2e4";
  for (const win of room.windows) {
    const rect = outsideOpening(room, win, 5);
    const [x, y] = R(cam, rect.x, rect.y);
    ctx.fillRect(x, y, rect.w * cam.scale, rect.d * cam.scale);
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "#6f655b";
  ctx.font = `11px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  room.doors.forEach((door, i) => labelOpening(cam, door, room.doors.length > 1 ? `door ${i + 1}` : "door"));
  for (const closet of room.closets) labelOpening(cam, closet, closet.kind === "sliding" ? "closet" : "closet door");
  ctx.restore();
}

function outsideOpening(room, opening, depth) {
  if (opening.wall === "n") return { x: opening.offset, y: -depth, w: opening.width, d: depth };
  if (opening.wall === "s") return { x: opening.offset, y: room.d, w: opening.width, d: depth };
  if (opening.wall === "w") return { x: -depth, y: opening.offset, w: depth, d: opening.width };
  return { x: room.w, y: opening.offset, w: depth, d: opening.width };
}

function labelOpening(cam, opening, text) {
  const mid = opening.offset + opening.width / 2;
  let x;
  let y;
  if (opening.wall === "n" || opening.wall === "s") {
    x = mid;
    y = opening.wall === "n" ? 10 : state.room.d - 12;
  } else {
    y = mid;
    x = opening.wall === "w" ? 18 : state.room.w - 22;
  }
  const [px, py] = R(cam, x, y);
  if (opening.width * cam.scale > 36) ctx.fillText(text, px, py);
}

function drawPlanLabels(cam) {
  const room = state.room;
  ctx.save();
  ctx.fillStyle = "#6f655b";
  ctx.font = `12px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  const midX = cam.originX + (room.w * cam.scale) / 2;
  const midY = cam.originY + (room.d * cam.scale) / 2;
  ctx.textAlign = "center";
  ctx.fillText(`${wallName(room, "n")} · ${fmtRoom(room.w)}`, midX, cam.originY - 28);
  ctx.fillText(`${wallName(room, "s")} · ${fmtRoom(room.w)}`, midX, cam.originY + room.d * cam.scale + 16);
  if (cam.originX > 78) {
    ctx.textAlign = "right";
    ctx.fillText(`${wallName(room, "w")} · ${fmtRoom(room.d)}`, cam.originX - 8, midY);
    ctx.textAlign = "left";
    ctx.fillText(`${wallName(room, "e")} · ${fmtRoom(room.d)}`, cam.originX + room.w * cam.scale + 8, midY);
  }
  ctx.textAlign = "center";
  ctx.font = `10px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.fillStyle = "#8a7d70";
  if (metric()) {
    const step = cmToIn(100);
    const count = Math.floor((room.w - 2) / step);
    for (let i = 1; i <= count; i++) {
      const [px, py] = R(cam, i * step, 0);
      if (Math.abs(px - midX) < 54) continue;
      ctx.fillText(`${i} m`, px, py - 10);
    }
  } else {
    const every = cam.scale * 12 >= 22 ? 12 : 24;
    for (let x = every; x < room.w; x += every) {
      const [px, py] = R(cam, x, 0);
      if (Math.abs(px - midX) < 54) continue;
      ctx.fillText(fmt(x), px, py - 10);
    }
  }
  ctx.restore();
}

function drawHandle(cam) {
  const piece = selected();
  if (!piece) return;
  const p = handlePoint(piece, cam);
  ctx.save();
  ctx.fillStyle = "#b8432f";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8f4";
  ctx.font = `16px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("↻", p.x, p.y + 1);
  ctx.restore();
}

function handlePoint(piece, cam) {
  const box = bounds(piece);
  let px;
  let py;
  if (piece.rot === 0) { px = box.x + box.w / 2; py = box.y + box.d; }
  else if (piece.rot === 180) { px = box.x + box.w / 2; py = box.y; }
  else if (piece.rot === 90) { px = box.x; py = box.y + box.d / 2; }
  else { px = box.x + box.w; py = box.y + box.d / 2; }
  const [fx, fy] = frontVector(piece.rot);
  const [sx, sy] = R(cam, px, py);
  return { x: sx + fx * 18, y: sy + fy * 18 };
}

/* ---------- elevations ---------- */

let wallHits = [];

function drawWalls() {
  const room = state.room;
  const { w, h } = cssSize();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#efe8dc";
  ctx.fillRect(0, 0, w, h);
  wallHits = [];
  const gap = 22;
  const labelH = 18;
  const maxLen = Math.max(room.w, room.d);
  const stack = 4 * room.h + 3 * gap;
  const scale = Math.min((w - 80) / maxLen, (h - 36 - 4 * labelH) / stack);
  let y = 16;
  for (const wall of WALLS) {
    drawElevation(wall, scale, y, w);
    y += labelH + room.h * scale + gap;
  }
}

function drawElevation(wall, scale, top, cssW) {
  const room = state.room;
  const len = wallLen(room, wall);
  const x0 = (cssW - len * scale) / 2;
  const floor = top + 16 + room.h * scale;
  ctx.fillStyle = "#6f655b";
  ctx.font = `12px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${wallName(room, wall)} · ${fmtRoom(len)}`, x0, top + 12);

  ctx.fillStyle = "#f7f3ec";
  ctx.fillRect(x0, floor - room.h * scale, len * scale, room.h * scale);
  ctx.strokeStyle = "rgba(90, 60, 30, 0.18)";
  ctx.lineWidth = 1;
  const course = metric() ? cmToIn(50) : 12;
  for (let i = course; i < room.h; i += course) {
    const yy = floor - i * scale;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x0 + len * scale, yy);
    ctx.stroke();
  }

  drawWetWall(wall, x0, floor, scale);

  const pieces = state.pieces.filter((p) => p.h >= 3 && showsOnWall(p, wall));
  pieces.sort((a, b) => a.h - b.h);
  for (const piece of pieces) {
    const box = bounds(piece);
    const span = alongWall(wall, box, room);
    const px = x0 + span.x * scale;
    const ph = Math.min(piece.h, room.h) * scale;
    const pw = span.w * scale;
    const py = floor - ph;
    const color = COLOR[piece.type] || "#8a7564";
    ctx.fillStyle = color;
    ctx.fillRect(px, py, pw, ph);
    const img = imageFor(piece);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      drawCover(img, px, py, pw, ph);
      ctx.restore();
    }
    ctx.strokeStyle = piece.id === state.selectedId ? "#b8432f" : "rgba(0,0,0,0.25)";
    ctx.lineWidth = piece.id === state.selectedId ? 2.5 : 1;
    ctx.strokeRect(px, py, pw, ph);
    if (pw > 28 && ph > 16) {
      ctx.fillStyle = img ? "#f7f3eb" : inkFor(color);
      ctx.font = `12px "Avenir Next", "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (ctx.measureText(piece.name).width <= pw - 4) {
        ctx.fillText(piece.name, px + pw / 2, py + ph / 2);
      }
    }
    wallHits.push({ id: piece.id, x: px, y: py, w: pw, h: ph });
  }

  for (const win of room.windows.filter((op) => op.wall === wall)) {
    const span = mirrorSpan(wall, win.offset, win.width, room);
    const px = x0 + span.x * scale;
    const topY = floor - (win.sill + win.height) * scale;
    ctx.fillStyle = "#d5e2e4";
    ctx.fillRect(px, topY, span.w * scale, win.height * scale);
    ctx.strokeStyle = "#6d8e96";
    ctx.strokeRect(px, topY, span.w * scale, win.height * scale);
    ctx.beginPath();
    ctx.moveTo(px + span.w * scale / 2, topY);
    ctx.lineTo(px + span.w * scale / 2, topY + win.height * scale);
    ctx.moveTo(px, topY + win.height * scale / 2);
    ctx.lineTo(px + span.w * scale, topY + win.height * scale / 2);
    ctx.stroke();
  }
  const doors = [...room.doors, ...room.closets].filter((op) => op.wall === wall);
  for (const door of doors) {
    const span = mirrorSpan(wall, door.offset, door.width, room);
    const height = door.height || 80;
    const px = x0 + span.x * scale;
    const py = floor - height * scale;
    ctx.fillStyle = door.kind ? "rgba(80, 70, 60, 0.18)" : "rgba(80, 60, 40, 0.2)";
    ctx.fillRect(px, py, span.w * scale, height * scale);
    ctx.strokeStyle = "#2c261f";
    ctx.strokeRect(px, py, span.w * scale, height * scale);
    if (span.w * scale > 36) {
      ctx.fillStyle = "#231e19";
      ctx.font = `11px "Avenir Next", "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(door.kind ? "closet" : "door", px + (span.w * scale) / 2, floor - 16);
    }
  }

  ctx.strokeStyle = "#2c261f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, floor);
  ctx.lineTo(x0 + len * scale, floor);
  ctx.stroke();
  ctx.fillStyle = "#8a7d70";
  ctx.font = `10px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(fmtRoom(room.h), x0 - 6, floor - room.h * scale + 4);
}

function drawWetWall(wall, x0, floor, scale) {
  const room = state.room;
  if (room.project !== "remodel" || !room.remodel) return;
  const kind = room.remodel.wetWalls;
  if (kind !== "tile" && kind !== "kit") return;
  const height = Math.min(kind === "kit" ? 60 : room.remodel.tileHeight, room.h);
  ctx.save();
  for (const tub of state.pieces.filter((p) => p.type === "tub")) {
    const box = bounds(tub);
    if (distanceToWall(box, wall, room) > 6) continue;
    const span = alongWall(wall, box, room);
    const px = x0 + span.x * scale;
    const pw = span.w * scale;
    const ph = height * scale;
    const py = floor - ph;
    ctx.fillStyle = kind === "kit" ? "rgba(226, 230, 232, 0.92)" : "rgba(176, 196, 186, 0.72)";
    ctx.fillRect(px, py, pw, ph);
    if (kind === "tile") {
      ctx.strokeStyle = "rgba(70, 90, 80, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let yy = py; yy < py + ph; yy += 6 * scale) {
        ctx.moveTo(px, yy);
        ctx.lineTo(px + pw, yy);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function showsOnWall(piece, wall) {
  return distanceToWall(bounds(piece), wall, state.room) <= 6;
}

function alongWall(wall, box, room) {
  return mirrorSpan(wall, wall === "e" || wall === "w" ? box.y : box.x, wall === "e" || wall === "w" ? box.d : box.w, room);
}

function mirrorSpan(wall, offset, width, room) {
  if (wall === "s") return { x: room.w - (offset + width), w: width };
  if (wall === "w") return { x: room.d - (offset + width), w: width };
  return { x: offset, w: width };
}

/* ---------- isometric ---------- */

function rotateXY(x, y, k, room) {
  const cx = room.w / 2;
  const cy = room.d / 2;
  let dx = x - cx;
  let dy = y - cy;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    const ndx = dy;
    const ndy = -dx;
    dx = ndx;
    dy = ndy;
  }
  return [dx, dy];
}

function projectRaw(x, y, z, k, room) {
  const [dx, dy] = rotateXY(x, y, k, room);
  return [(dx - dy) * Math.cos(Math.PI / 6), (dx + dy) * 0.5 - z];
}

function signedArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += (b[0] - a[0]) * (b[1] + a[1]);
  }
  return sum;
}

function drawIso() {
  const room = state.room;
  const { w, h } = cssSize();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#e7e0d4";
  ctx.fillRect(0, 0, w, h);
  const k = state.corner;
  const corners = [];
  for (const x of [0, room.w]) {
    for (const y of [0, room.d]) {
      for (const z of [0, room.h]) corners.push(projectRaw(x, y, z, k, room));
    }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of corners) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const scale = Math.min((w - 48) / (maxX - minX), (h - 48) / (maxY - minY));
  const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (h - (maxY - minY) * scale) / 2 - minY * scale;
  const P = (x, y, z) => {
    const [sx, sy] = projectRaw(x, y, z, k, room);
    return [ox + sx * scale, oy + sy * scale];
  };

  const wallFaces = [
    { wall: "n", pts: [[0, 0, 0], [room.w, 0, 0], [room.w, 0, room.h], [0, 0, room.h]] },
    { wall: "e", pts: [[room.w, 0, 0], [room.w, room.d, 0], [room.w, room.d, room.h], [room.w, 0, room.h]] },
    { wall: "s", pts: [[room.w, room.d, 0], [0, room.d, 0], [0, room.d, room.h], [room.w, room.d, room.h]] },
    { wall: "w", pts: [[0, room.d, 0], [0, 0, 0], [0, 0, room.h], [0, room.d, room.h]] },
  ].map((face) => ({ ...face, proj: face.pts.map((p) => P(...p)), area: 0 }));
  for (const face of wallFaces) face.area = signedArea(face.proj);
  let visible = wallFaces.filter((f) => f.area > 0);
  if (visible.length !== 2) visible = wallFaces.filter((f) => f.area < 0);

  const floor = [[0, 0, 0], [room.w, 0, 0], [room.w, room.d, 0], [0, room.d, 0]].map((p) => P(...p));
  poly(floor, floorColor(room));
  ctx.save();
  trace(floor);
  ctx.clip();
  ctx.strokeStyle = "rgba(90, 60, 30, 0.28)";
  ctx.lineWidth = 1;
  const grid = metric() ? cmToIn(floorFinish(room) === "tile" ? 30 : 100) : 12;
  const nx = Math.floor(room.w / grid);
  const ny = Math.floor(room.d / grid);
  for (let i = 0; i <= nx; i++) line(P(i * grid, 0, 0.4), P(i * grid, room.d, 0.4));
  for (let i = 0; i <= ny; i++) line(P(0, i * grid, 0.4), P(room.w, i * grid, 0.4));
  ctx.restore();

  for (const face of visible) {
    poly(face.proj, face.wall === "n" || face.wall === "s" ? "#f4efe6" : "#e7dece");
    drawWallOpenings(face.wall, P);
  }

  const pieces = [...state.pieces].filter((p) => p.type !== "rug" || p.h > 0).sort((a, b) => depthOf(a, k, room) - depthOf(b, k, room));
  // Rugs first if the depth sort didn't already put them low. Depth sort is enough.
  const rugs = pieces.filter((p) => p.type === "rug");
  const rest = pieces.filter((p) => p.type !== "rug");
  for (const piece of rugs.concat(rest)) drawIsoBox(piece, P, room);

  const names = visible.map((f) => wallName(room, f.wall));
  const label = document.getElementById("corner-label");
  if (label) label.textContent = names.join(" · ");
}

function depthOf(piece, k, room) {
  const b = bounds(piece);
  const [dx, dy] = rotateXY(b.x + b.w / 2, b.y + b.d / 2, k, room);
  return dx + dy;
}

function drawWallOpenings(wall, P) {
  const room = state.room;
  const y0 = wall === "n" ? 0 : wall === "s" ? room.d : null;
  const x0 = wall === "w" ? 0 : wall === "e" ? room.w : null;
  const quad = (a, b, z0, z1) => {
    if (wall === "n" || wall === "s") return [P(a, y0, z0), P(b, y0, z0), P(b, y0, z1), P(a, y0, z1)];
    return [P(x0, a, z0), P(x0, b, z0), P(x0, b, z1), P(x0, a, z1)];
  };
  if (room.project === "remodel" && room.remodel && (room.remodel.wetWalls === "tile" || room.remodel.wetWalls === "kit")) {
    const kind = room.remodel.wetWalls;
    const height = Math.min(kind === "kit" ? 60 : room.remodel.tileHeight, room.h);
    for (const tub of state.pieces.filter((p) => p.type === "tub")) {
      const box = bounds(tub);
      if (distanceToWall(box, wall, room) > 6) continue;
      const span = wall === "n" || wall === "s" ? { offset: box.x, width: box.w } : { offset: box.y, width: box.d };
      poly(quad(span.offset, span.offset + span.width, 0, height), kind === "kit" ? "#e4e7ea" : "#c9d5cc");
    }
  }
  for (const win of room.windows.filter((op) => op.wall === wall)) {
    poly(quad(win.offset, win.offset + win.width, win.sill, win.sill + win.height), "#c5d5d8");
  }
  const doors = [...room.doors, ...room.closets].filter((op) => op.wall === wall);
  for (const door of doors) {
    poly(quad(door.offset, door.offset + door.width, 0, door.height || 80), door.kind ? "#d9d0c3" : "#cfc3b4");
  }
}

function drawIsoBox(piece, P, room) {
  const b = bounds(piece);
  const z1 = Math.max(1, piece.h);
  const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.d;
  const color = COLOR[piece.type] || "#8a7564";
  const back = wallFromRot(piece.rot);
  const faces = [
    { pts: [[x0, y0, 0], [x1, y0, 0], [x1, y0, z1], [x0, y0, z1]], side: "n" },
    { pts: [[x1, y0, 0], [x1, y1, 0], [x1, y1, z1], [x1, y0, z1]], side: "e" },
    { pts: [[x1, y1, 0], [x0, y1, 0], [x0, y1, z1], [x1, y1, z1]], side: "s" },
    { pts: [[x0, y1, 0], [x0, y0, 0], [x0, y0, z1], [x0, y1, z1]], side: "w" },
  ];
  const projected = faces.map((f) => ({ ...f, proj: f.pts.map((pt) => P(...pt)), area: 0 }));
  for (const f of projected) f.area = signedArea(f.proj);
  const pos = projected.filter((f) => f.area > 0);
  const neg = projected.filter((f) => f.area < 0);
  const sides = pos.length >= 1 && pos.length <= 3 ? pos : neg;
  for (const face of sides) {
    const tone = face.side === back ? -0.34 : -0.12;
    poly(face.proj, shade(color, tone));
  }
  const top = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
  poly(top, shade(color, 0.14));
  if (piece.id === state.selectedId) {
    ctx.save();
    trace(top);
    ctx.strokeStyle = "#b8432f";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  const spanA = Math.hypot(top[1][0] - top[0][0], top[1][1] - top[0][1]);
  const spanB = Math.hypot(top[2][0] - top[1][0], top[2][1] - top[1][1]);
  if (spanA > 46 && spanB > 28) {
    const c = P((x0 + x1) / 2, (y0 + y1) / 2, z1);
    ctx.fillStyle = inkFor(shade(color, 0.14));
    ctx.font = `12px "Avenir Next", "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(piece.name, c[0], c[1]);
  }
  void room;
}

function poly(pts, fill) {
  trace(pts);
  ctx.fillStyle = fill;
  ctx.fill();
}

function trace(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function line(a, b) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function draw() {
  if (!state.room) return;
  resizeCanvas();
  try {
    if (state.view === "plan") drawPlan();
    else if (state.view === "walls") drawWalls();
    else drawIso();
  } catch (err) {
    console.error(err);
  }
  const { w } = cssSize();
  canvas.setAttribute("aria-label", `${state.room.name}, ${fmtRoom(state.room.w)} by ${fmtRoom(state.room.d)}, ${state.pieces.length} pieces`);
  void w;
}

/* ---------- interaction ---------- */

function selected() {
  return state.pieces.find((p) => p.id === state.selectedId) || null;
}

function eventPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
}

function hitPiece(mx, my) {
  if (state.view === "walls") {
    for (let i = wallHits.length - 1; i >= 0; i--) {
      const h = wallHits[i];
      if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
        return state.pieces.find((p) => p.id === h.id) || null;
      }
    }
    return null;
  }
  if (state.view !== "plan") return null;
  const cam = camera();
  const roomPt = toRoom(mx, my, cam);
  for (let i = state.pieces.length - 1; i >= 0; i--) {
    const piece = state.pieces[i];
    if (piece.type === "rug") continue;
    const b = bounds(piece);
    if (roomPt.x >= b.x && roomPt.x <= b.x + b.w && roomPt.y >= b.y && roomPt.y <= b.y + b.d) return piece;
  }
  for (const piece of state.pieces) {
    if (piece.type !== "rug") continue;
    const b = bounds(piece);
    if (roomPt.x >= b.x && roomPt.x <= b.x + b.w && roomPt.y >= b.y && roomPt.y <= b.y + b.d) return piece;
  }
  return null;
}

function onPointerDown(e) {
  if (state.view !== "plan" && state.view !== "walls") return;
  const { mx, my } = eventPoint(e);
  if (state.view === "plan" && state.selectedId) {
    const piece = selected();
    const hp = handlePoint(piece, camera());
    if (Math.hypot(mx - hp.x, my - hp.y) <= 14) {
      const before = snapshot();
      rotatePiece(piece);
      commit(before);
      sync();
      return;
    }
  }
  const piece = hitPiece(mx, my);
  if (state.view === "walls") {
    state.selectedId = piece ? piece.id : null;
    renderPieceList();
    renderInspector();
    draw();
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  const before = snapshot();
  if (!piece) {
    drag = { kind: "pan", mx, my, panX: state.panX, panY: state.panY, before };
    canvas.style.cursor = "grabbing";
    return;
  }
  state.selectedId = piece.id;
  const cam = camera();
  const roomPt = toRoom(mx, my, cam);
  drag = { kind: "piece", id: piece.id, ox: roomPt.x - piece.x, oy: roomPt.y - piece.y, before };
  canvas.style.cursor = "grabbing";
  renderPieceList();
  renderInspector();
  draw();
}

function onPointerMove(e) {
  if (!drag) return;
  const { mx, my } = eventPoint(e);
  if (drag.kind === "pan") {
    state.panX = drag.panX + (mx - drag.mx);
    state.panY = drag.panY + (my - drag.my);
    draw();
    return;
  }
  const piece = state.pieces.find((p) => p.id === drag.id);
  if (!piece) return;
  const cam = camera();
  const roomPt = toRoom(mx, my, cam);
  stick(piece, roomPt.x - drag.ox, roomPt.y - drag.oy);
  draw();
}

function stick(piece, rawX, rawY) {
  const room = state.room;
  const g = metric() ? (state.zoom >= 2 ? cmToIn(1) : cmToIn(5)) : (state.zoom >= 2 ? 1 : 6);
  let x = Math.round(rawX / g) * g;
  let y = Math.round(rawY / g) * g;
  const fp = footprint(piece, piece.rot);
  const slack = Math.max(4, g);
  if (Math.abs(rawX) <= slack) x = 0;
  if (Math.abs(rawY) <= slack) y = 0;
  if (Math.abs(rawX + fp.w - room.w) <= slack) x = room.w - fp.w;
  if (Math.abs(rawY + fp.d - room.d) <= slack) y = room.d - fp.d;
  const others = state.pieces.filter((p) => p.id !== piece.id && p.type !== "rug" && piece.type !== "rug");
  for (const other of others) {
    const o = bounds(other);
    const box = { x, y, w: fp.w, d: fp.d };
    if (Math.abs(box.y - o.y) < 8 || Math.abs(box.y + box.d - (o.y + o.d)) < 8 || (box.y < o.y + o.d && box.y + box.d > o.y)) {
      if (Math.abs(x + fp.w - o.x) < slack) x = o.x - fp.w;
      if (Math.abs(x - (o.x + o.w)) < slack) x = o.x + o.w;
      if (Math.abs(x - o.x) < slack) x = o.x;
    }
    if (Math.abs(box.x - o.x) < 8 || Math.abs(box.x + box.w - (o.x + o.w)) < 8 || (box.x < o.x + o.w && box.x + box.w > o.x)) {
      if (Math.abs(y + fp.d - o.y) < slack) y = o.y - fp.d;
      if (Math.abs(y - (o.y + o.d)) < slack) y = o.y + o.d;
      if (Math.abs(y - o.y) < slack) y = o.y;
    }
  }
  piece.x = x;
  piece.y = y;
  clampPiece(room, piece);
}

function onPointerUp() {
  if (!drag) return;
  const before = drag.before;
  const kind = drag.kind;
  drag = null;
  canvas.style.cursor = "grab";
  if (kind === "pan") {
    save();
    return;
  }
  commit(before);
  renderNotes();
  renderInspector();
}

function rotatePiece(piece) {
  const b = bounds(piece);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.d / 2;
  piece.rot = (piece.rot + 90) % 360;
  const fp = footprint(piece, piece.rot);
  piece.x = cx - fp.w / 2;
  piece.y = cy - fp.d / 2;
  clampPiece(state.room, piece);
}

function onWheel(e) {
  if (state.view !== "plan") return;
  e.preventDefault();
  const { mx, my } = eventPoint(e);
  const beforeCam = camera();
  const roomPt = toRoom(mx, my, beforeCam);
  const { w, h } = cssSize();
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  state.zoom = clamp(state.zoom * factor, 0.4, 5);
  const margin = planMargin(w, h);
  const fit = Math.min((w - margin * 2) / state.room.w, (h - margin * 2) / state.room.d);
  const scale = fit * state.zoom;
  state.panX = mx - roomPt.x * scale - (w - state.room.w * scale) / 2;
  state.panY = my - roomPt.y * scale - (h - state.room.d * scale) / 2;
  draw();
}

function onKey(e) {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (e.key === "1") setView("plan");
  if (e.key === "2") setView("walls");
  if (e.key === "3") setView("corners");
  if (e.key === "[") turn(-1);
  if (e.key === "]") turn(1);
  if (e.key === "Escape") {
    state.selectedId = null;
    renderPieceList();
    renderInspector();
    draw();
  }
  const piece = selected();
  if (!piece || state.view !== "plan") return;
  if (e.key === "r" || e.key === "R") {
    const before = snapshot();
    rotatePiece(piece);
    commit(before);
    sync();
  }
  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    removePiece(piece.id);
  }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key]) {
    e.preventDefault();
    const before = snapshot();
    const step = metric() ? (e.shiftKey ? cmToIn(1) : cmToIn(5)) : (e.shiftKey ? 1 : 6);
    piece.x += arrows[e.key][0] * step;
    piece.y += arrows[e.key][1] * step;
    clampPiece(state.room, piece);
    commit(before);
    draw();
    renderNotes();
    renderInspector();
  }
}

function onDoubleClick(e) {
  if (state.view !== "plan") return;
  const { mx, my } = eventPoint(e);
  const piece = hitPiece(mx, my);
  if (!piece) return;
  const before = snapshot();
  state.selectedId = piece.id;
  rotatePiece(piece);
  commit(before);
  sync();
}

/* ---------- UI ---------- */

function selectedClearance(piece) {
  if (!piece) return "";
  const b = bounds(piece);
  const room = state.room;
  const bits = [
    [distanceToWall(b, "n", room), "n"],
    [distanceToWall(b, "e", room), "e"],
    [distanceToWall(b, "s", room), "s"],
    [distanceToWall(b, "w", room), "w"],
  ];
  return bits.map(([dist, wall]) => `${wallName(room, wall)} ${dist < 1 ? "flush" : fmt(dist)}`).join(" · ");
}

function renderNotes() {
  const root = document.getElementById("notes");
  root.replaceChildren();
  for (const note of collectNotes()) {
    const p = document.createElement("p");
    p.className = `note ${note.tone}`;
    p.textContent = note.text;
    root.appendChild(p);
  }
}

function updateHistoryButtons() {
  document.getElementById("undo").disabled = state.past.length === 0;
  document.getElementById("redo").disabled = state.future.length === 0;
}

function updateSqft() {
  const room = state.room;
  document.getElementById("sqft").textContent = `${fmtRoom(room.w)} × ${fmtRoom(room.d)} · ${areaText(room.w * room.d)}`;
}

function syncViewChrome() {
  document.getElementById("zoombox").hidden = state.view !== "plan";
  document.getElementById("corner-controls").hidden = state.view !== "corners";
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.view === state.view ? "true" : "false");
  });
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.mode === state.mode ? "true" : "false");
  });
  const hints = {
    plan: "Bird's-eye graph paper. The dark edge is the back of a piece. Scroll to zoom, double-click to turn.",
    walls: "Standing inside, looking at each wall. Heights are real. Switch to Plan to drag.",
    corners: "A corner of the room. Turn to walk around it.",
  };
  document.getElementById("view-hint").textContent = hints[state.view];
  document.getElementById("suggest").textContent = state.mode === "flow" ? "Arrange for flow" : "Arrange to fit";
}

function syncUnits() {
  document.body.dataset.units = metric() ? "metric" : "us";
  document.querySelectorAll("[data-units]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.units === state.units ? "true" : "false");
  });
  for (const [id, minFt, maxFt] of [["room-w-ft", 6, 60], ["room-d-ft", 6, 60], ["room-h-ft", 7, 20]]) {
    const el = document.getElementById(id);
    if (metric()) {
      el.min = String(toCm(minFt * 12));
      el.max = String(toCm(maxFt * 12));
    } else {
      el.min = String(minFt);
      el.max = String(maxFt);
    }
  }
}

function syncRoomInputs() {
  syncUnits();
  const room = state.room;
  const name = document.getElementById("room-name");
  if (document.activeElement !== name) name.value = room.name;
  setDim("room-w-ft", "room-w-in", room.w);
  setDim("room-d-ft", "room-d-in", room.d);
  setDim("room-h-ft", "room-h-in", room.h);
  for (const wall of WALLS) {
    const el = document.getElementById(`label-${wall}`);
    if (document.activeElement !== el) el.value = wallName(room, wall);
  }
  updateSqft();
}

function renderOpenings() {
  const root = document.getElementById("openings");
  const room = state.room;
  root.replaceChildren();
  if (!room.doors.length && !room.windows.length && !room.closets.length) {
    const empty = document.createElement("p");
    empty.className = "fine";
    empty.textContent = "Nothing on the walls yet.";
    root.append(empty);
  }
  room.doors.forEach((door, i) => root.appendChild(openingRow("door", room.doors.length > 1 ? `Door ${i + 1}` : "Door", door)));
  room.windows.forEach((win, i) => root.appendChild(openingRow("window", room.windows.length > 1 ? `Window ${i + 1}` : "Window", win)));
  room.closets.forEach((closet, i) => root.appendChild(openingRow("closet", room.closets.length > 1 ? `Closet ${i + 1}` : "Closet", closet)));
}

function lengthInput(field, inches, minIn, maxIn) {
  if (metric()) {
    return `<input data-field="${field}" data-unit="cm" type="number" min="${toCm(minIn)}" max="${toCm(maxIn)}" step="1" value="${toCm(inches)}">`;
  }
  return `<input data-field="${field}" type="number" min="${minIn}" max="${maxIn}" step="1" value="${Math.round(inches)}">`;
}

function unitWord() {
  return metric() ? "cm" : "in";
}

function fromLabel(wall) {
  return wall === "e" || wall === "w" ? "From the top" : "From the left";
}

function hingeNames(wall) {
  if (wall === "e" || wall === "w") return ["Hinges toward the top", "Hinges toward the bottom"];
  return ["Hinges on the left", "Hinges on the right"];
}

function offsetInputs(inches, wall) {
  const label = fromLabel(wall);
  if (metric()) return `${label} ${lengthInput("offset", inches, 0, 720)} cm`;
  const off = splitInches(inches);
  return `${label} <input data-field="ft" type="number" min="0" max="60" value="${off.ft}" aria-label="${label}, feet"> ft
    <input data-field="inch" type="number" min="0" max="11" value="${off.inch}" aria-label="${label}, inches"> in`;
}

function openingRow(kind, title, op) {
  const row = document.createElement("div");
  row.className = "opening";
  row.dataset.kind = kind;
  row.dataset.id = op.id;
  const wallOpts = WALLS.map((w) => `<option value="${w}" ${op.wall === w ? "selected" : ""}>${wallName(state.room, w)}</option>`).join("");
  let extra = "";
  if (kind === "door") {
    const [startName, endName] = hingeNames(op.wall);
    extra = `<label class="dims">Hinge <select data-field="hinge" aria-label="Hinge">
      <option value="start" ${op.hinge !== "end" ? "selected" : ""}>${startName}</option>
      <option value="end" ${op.hinge === "end" ? "selected" : ""}>${endName}</option>
    </select></label>`;
  } else if (kind === "window") {
    extra = `<label class="dims">Sill ${lengthInput("sill", op.sill, 0, 120)} ${unitWord()}</label>
      <label class="dims">Height ${lengthInput("winh", op.height, 12, 120)} ${unitWord()}</label>`;
  } else {
    extra = `<label class="dims">Door <select data-field="kind" aria-label="Closet door">
      <option value="sliding" ${op.kind !== "swing" ? "selected" : ""}>Sliding</option>
      <option value="swing" ${op.kind === "swing" ? "selected" : ""}>Swinging</option>
    </select></label>`;
  }
  row.innerHTML = `
    <div class="opening-head">
      <strong>${title}</strong>
      <button type="button" data-act="remove" aria-label="Remove ${title}">Remove</button>
    </div>
    <label class="dims">Wall <select data-field="wall" aria-label="Wall">${wallOpts}</select></label>
    <label class="dims">${offsetInputs(op.offset, op.wall)}</label>
    <label class="dims">Width ${lengthInput("width", op.width, 12, 240)} ${unitWord()}</label>
    ${extra}`;
  return row;
}

function readMeasured(el) {
  if (!el) return 0;
  const n = Number(el.value) || 0;
  return el.dataset.unit === "cm" ? cmToIn(n) : n;
}

function readOpeningRow(row) {
  const kind = row.dataset.kind;
  const id = row.dataset.id;
  const room = state.room;
  const list = kind === "door" ? room.doors : kind === "window" ? room.windows : room.closets;
  const op = list.find((item) => item.id === id);
  if (!op) return;
  const val = (field) => row.querySelector(`[data-field="${field}"]`);
  op.wall = val("wall").value;
  op.offset = metric()
    ? readMeasured(val("offset"))
    : (Number(val("ft").value) || 0) * 12 + (Number(val("inch").value) || 0);
  op.width = readMeasured(val("width")) || op.width;
  if (kind === "door" || kind === "closet") {
    const hinge = val("hinge");
    if (hinge) op.hinge = hinge.value;
  }
  if (kind === "window") {
    op.sill = readMeasured(val("sill"));
    op.height = readMeasured(val("winh")) || op.height;
  }
  if (kind === "closet" && val("kind")) op.kind = val("kind").value;
}

function money(n) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function storeUrl(store, query) {
  const q = encodeURIComponent(query);
  if (store === "hd") return `https://www.homedepot.com/s/${q}`;
  return `https://www.lowes.com/search?searchTerm=${q}`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : (many || `${one}s`)}`;
}

function takeoff(room, pieces) {
  if (room.project !== "remodel" || !room.remodel) return { lines: [], note: "" };
  const waste = 1 + (room.remodel.waste || 0) / 100;
  const floorIn = floorNetSqIn(room, pieces);
  const wetIn = room.remodel.wetWalls === "tile" ? wetAreaSqIn(room, pieces) : 0;
  const tubs = pieces.filter((p) => p.type === "tub");
  const toilets = pieces.filter((p) => p.type === "toilet");
  const vanities = pieces.filter((p) => p.type === "vanity");
  const lines = [];
  const push = (id, name, price, query, detail) => lines.push({ id, name, price, query, detail });

  if (room.remodel.floor === "tile" && floorIn > 0) {
    const need = (floorIn / 144) * waste;
    const qty = Math.ceil(need / 16 - 1e-9);
    const floorName = metric() ? "30×60 cm floor tile" : "12×24 floor tile";
    const floorQuery = metric() ? "30x60 cm porcelain floor tile" : "12x24 porcelain floor tile";
    push("floor-tile", `${plural(qty, "box", "boxes")} of ${floorName}`, qty * 48, floorQuery, `${areaText(floorIn)} of floor, plus extra for cuts`);
  }
  if (room.remodel.floor === "vinyl" && floorIn > 0) {
    const qty = Math.ceil((floorIn / 144) * waste - 1e-9);
    const vinylName = metric() ? `${areaText(qty * 144)} of vinyl plank` : `${qty} sq ft of vinyl plank`;
    push("vinyl", vinylName, qty * 2.49, "luxury vinyl plank flooring", "includes extra for cuts");
  }
  if (room.remodel.wetWalls === "tile" && wetIn > 0) {
    const need = (wetIn / 144) * waste;
    const qty = Math.ceil(need / 10 - 1e-9);
    const sheets = Math.ceil(wetIn / 144 / 15 - 1e-9);
    const wallNameTile = metric() ? "7.5×15 cm subway tile" : "subway wall tile";
    const wallQuery = metric() ? "7.5x15 cm subway tile" : "3x6 subway tile";
    push("wall-tile", `${plural(qty, "box", "boxes")} of ${wallNameTile}`, qty * 18, wallQuery, `${areaText(wetIn)} on the walls the tub touches`);
    push("board", `${plural(sheets, "sheet")} of cement board`, sheets * 16, "cement backer board", "the wet walls, before the tile");
  }
  if (room.remodel.wetWalls === "kit" && tubs.length) {
    push("surround", tubs.length === 1 ? "Tub surround kit" : plural(tubs.length, "tub surround kit"), tubs.length * 329, "3 piece bathtub wall surround", "a kit wants the tub in an alcove");
  }
  const mortar = (room.remodel.floor === "tile" ? (floorIn / 144) * waste : 0) + (room.remodel.wetWalls === "tile" ? (wetIn / 144) * waste : 0);
  if (mortar > 0) {
    const bags = Math.ceil(mortar / 50 - 1e-9);
    const grout = Math.ceil(mortar / 80 - 1e-9);
    push("thinset", `${plural(bags, "bag")} of thinset`, bags * 20, "modified thinset mortar 50 lb", metric() ? "about 4.6 m² a bag" : "about 50 sq ft a bag");
    push("grout", `${plural(grout, "bag")} of grout`, grout * 18, "sanded grout", metric() ? "about 7.4 m² a bag" : "about 80 sq ft a bag");
    push("tile-kit", "Spacers, sponge, and a float", 22, "tile installation kit", "");
  }
  if (tubs.length) {
    const name = tubs.length === 1 ? `${fmt(tubs[0].w)} alcove tub` : plural(tubs.length, "alcove tub");
    const tubDetail = tubs.some((t) => Math.abs(t.w - 60) > 0.5) ? (metric() ? "priced as a common 152 cm tub" : "priced as a common 60″ tub") : "";
    const tubQuery = metric() ? `${toCm(tubs[0].w)} cm alcove bathtub` : `${Math.round(tubs[0].w)} inch alcove bathtub`;
    push("tub", name, tubs.length * 489, tubQuery, tubDetail);
    push("tub-faucet", tubs.length === 1 ? "Tub and shower faucet" : plural(tubs.length, "tub and shower faucet"), tubs.length * 149, "tub and shower faucet", "");
    push("caulk", "Silicone for the tub", 14, "kitchen bath silicone caulk", "");
  }
  if (toilets.length) {
    push("toilet", toilets.length === 1 ? "Toilet" : plural(toilets.length, "toilet"), toilets.length * 229, "two piece toilet", "");
    push("toilet-kit", toilets.length === 1 ? "Wax ring, bolts, and supply line" : plural(toilets.length, "toilet install kit"), toilets.length * 28, "toilet installation kit wax ring", "");
  }
  if (vanities.length) {
    const name = vanities.length === 1 ? `${fmt(vanities[0].w)} vanity with top` : plural(vanities.length, "vanity", "vanities");
    const vanityDetail = vanities.some((v) => Math.abs(v.w - 36) > 0.5) ? (metric() ? "priced as a common 91 cm vanity with a top" : "priced as a common 36″ vanity with a top") : "";
    const vanityQuery = metric() ? `${toCm(vanities[0].w)} cm bathroom vanity with top` : `${Math.round(vanities[0].w)} inch bathroom vanity with top`;
    push("vanity", name, vanities.length * 449, vanityQuery, vanityDetail);
    push("vanity-faucet", vanities.length === 1 ? "Vanity faucet" : plural(vanities.length, "vanity faucet"), vanities.length * 96, "bathroom sink faucet", "");
    push("mirror", vanities.length === 1 ? "Mirror" : plural(vanities.length, "mirror"), vanities.length * 79, "bathroom vanity mirror", "");
  }

  if (!lines.length) {
    return { lines, note: "Pick a floor, or add a tub, and the list fills in from the sizes on the plan." };
  }
  let note = "Planning prices, so you can see the size of the job. They are not a shelf price. Each link searches the store.";
  if (room.remodel.wetWalls === "tile" && tubs.length && wetIn <= 0) note += " The tub isn’t against a wall yet, so the wall tile isn’t counted.";
  else if (room.remodel.wetWalls === "tile" && !tubs.length) note += " Add a tub and the wall tile shows up.";
  return { lines, note };
}

function floorNetSqIn(room, pieces) {
  let area = room.w * room.d;
  for (const tub of pieces.filter((p) => p.type === "tub")) {
    const box = bounds(tub);
    const w = Math.max(0, Math.min(box.x + box.w, room.w) - Math.max(box.x, 0));
    const d = Math.max(0, Math.min(box.y + box.d, room.d) - Math.max(box.y, 0));
    area -= w * d;
  }
  return Math.max(0, area);
}

function wetAreaSqIn(room, pieces) {
  const tileH = room.remodel.tileHeight;
  let area = 0;
  for (const tub of pieces.filter((p) => p.type === "tub")) {
    const box = bounds(tub);
    for (const wall of WALLS) {
      if (distanceToWall(box, wall, room) > 6) continue;
      const span = wall === "n" || wall === "s" ? box.w : box.d;
      area += span * tileH;
      for (const win of room.windows.filter((w) => w.wall === wall)) {
        const piece = wall === "n" || wall === "s" ? [box.x, box.x + box.w] : [box.y, box.y + box.d];
        const hole = [win.offset, win.offset + win.width];
        const overlap = Math.min(piece[1], hole[1]) - Math.max(piece[0], hole[0]);
        if (overlap <= 0) continue;
        const top = Math.min(tileH, (win.sill || 0) + (win.height || 0));
        const bot = Math.max(0, win.sill || 0);
        if (top > bot) area -= overlap * (top - bot);
      }
    }
  }
  return Math.max(0, area);
}

function renderMaterials() {
  const finishes = document.getElementById("finishes");
  const section = document.getElementById("materials");
  const remodel = state.room.project === "remodel";
  finishes.hidden = !remodel;
  section.hidden = !remodel;
  document.querySelectorAll("[data-project]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.project === state.room.project ? "true" : "false");
  });
  if (!remodel) return;
  const remodelState = state.room.remodel;
  document.getElementById("floor-finish").value = remodelState.floor;
  document.getElementById("wet-walls").value = remodelState.wetWalls;
  const heightField = document.getElementById("tile-height-field");
  heightField.hidden = remodelState.wetWalls !== "tile";
  const sel = document.getElementById("tile-height");
  const ceiling = state.room.h;
  const wanted = [60, 72, ceiling].filter((v, i, arr) => v <= ceiling && arr.indexOf(v) === i);
  if (!wanted.includes(remodelState.tileHeight)) wanted.push(remodelState.tileHeight);
  wanted.sort((a, b) => a - b);
  const sig = `${state.units}:${wanted.join(",")}`;
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.replaceChildren();
    for (const v of wanted) {
      const o = document.createElement("option");
      o.value = String(v);
      const preset = !metric() && v === 60 ? "5 ft" : !metric() && v === 72 ? "6 ft" : fmt(v);
      o.textContent = v === ceiling ? "To the ceiling" : preset;
      sel.append(o);
    }
  }
  sel.value = String(remodelState.tileHeight);

  const { lines, note } = takeoff(state.room, state.pieces);
  document.getElementById("materials-note").textContent = note;
  const ul = document.getElementById("materials-list");
  ul.replaceChildren();
  let remain = 0;
  let got = 0;
  for (const item of lines) {
    const checked = !!remodelState.got[item.id];
    const li = document.createElement("li");
    li.className = "buy" + (checked ? " got" : "");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = checked;
    check.setAttribute("aria-label", `Got ${item.name}`);
    check.addEventListener("change", () => {
      const before = snapshot();
      if (check.checked) state.room.remodel.got[item.id] = true;
      else delete state.room.remodel.got[item.id];
      commit(before);
      sync();
    });
    const body = document.createElement("div");
    body.className = "buy-body";
    const top = document.createElement("div");
    top.className = "buy-top";
    const title = document.createElement("strong");
    title.textContent = item.name;
    const price = document.createElement("span");
    price.className = "buy-price";
    price.textContent = money(item.price);
    top.append(title, price);
    body.append(top);
    if (item.detail) {
      const detail = document.createElement("small");
      detail.textContent = item.detail;
      body.append(detail);
    }
    const links = document.createElement("span");
    links.className = "buy-links";
    for (const [store, label] of [["hd", "Home Depot"], ["lowes", "Lowe's"]]) {
      const a = document.createElement("a");
      a.href = storeUrl(store, item.query);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label;
      links.append(a);
    }
    body.append(links);
    li.append(check, body);
    ul.append(li);
    if (checked) got += item.price;
    else remain += item.price;
  }
  const total = document.getElementById("materials-total");
  if (!lines.length) total.textContent = "";
  else if (got > 0) total.textContent = `Still to buy ${money(remain)} · already checked ${money(got)}`;
  else total.textContent = `Planning total ${money(remain)}`;
}

function renderPieceList() {
  const ul = document.getElementById("pieces");
  ul.replaceChildren();
  if (!state.pieces.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing in the room yet.";
    ul.appendChild(li);
    return;
  }
  const problems = new Set(overlapsOf(state.pieces).flat().map((p) => p.id));
  for (const piece of state.pieces) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "piece" + (piece.id === state.selectedId ? " selected" : "");
    btn.dataset.id = piece.id;
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = COLOR[piece.type] || "#8a7564";
    const meta = document.createElement("span");
    meta.className = "meta";
    const name = document.createElement("strong");
    name.textContent = piece.name;
    const small = document.createElement("small");
    small.textContent = fmtTriple(piece.w, piece.d, piece.h);
    meta.append(name, small);
    btn.append(sw, meta);
    if (piece.photo) {
      const img = document.createElement("img");
      img.src = piece.photo;
      img.alt = "";
      btn.append(img);
    } else if (problems.has(piece.id)) {
      const dot = document.createElement("span");
      dot.className = "warn-dot";
      btn.append(dot);
    }
    li.append(btn);
    ul.append(li);
  }
}

function renderInspector() {
  const root = document.getElementById("inspector");
  const piece = selected();
  root.replaceChildren();
  if (!piece) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Click a piece on the plan, or in the list.";
    root.append(p);
    return;
  }
  const name = document.createElement("label");
  name.className = "field";
  name.innerHTML = `<span>Name</span>`;
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = piece.name;
  nameInput.maxLength = 40;
  nameInput.addEventListener("focus", () => { focusSnap = snapshot(); });
  nameInput.addEventListener("input", () => { piece.name = nameInput.value || piece.type; draw(); });
  nameInput.addEventListener("change", () => { commit(focusSnap); renderPieceList(); renderNotes(); });
  name.append(nameInput);

  const preset = document.createElement("label");
  preset.className = "field";
  preset.append(document.createTextNode("Size preset"));
  const sel = document.createElement("select");
  const options = CATALOG.filter((c) => c.type === piece.type);
  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Custom";
  sel.append(custom);
  options.forEach((c, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = `${c.name} · ${fmtPair(c.w, c.d)}`;
    if (Math.abs(c.w - piece.w) < 0.4 && Math.abs(c.d - piece.d) < 0.4 && Math.abs(c.h - piece.h) < 0.4) o.selected = true;
    sel.append(o);
  });
  if (![...sel.options].some((o) => o.selected)) custom.selected = true;
  sel.addEventListener("change", () => {
    if (sel.value === "custom") return;
    const before = snapshot();
    const c = options[Number(sel.value)];
    piece.w = c.w; piece.d = c.d; piece.h = c.h;
    if (!piece.name || CATALOG.some((item) => item.name === piece.name)) piece.name = uniqueName(c.name, piece.id);
    clampPiece(state.room, piece);
    commit(before);
    sync();
  });
  preset.append(sel);

  const dims = document.createElement("div");
  dims.className = "inspector-grid";
  for (const [key, label] of [["w", "Width"], ["d", "Depth"], ["h", "Height"]]) {
    const lab = document.createElement("label");
    lab.className = "field";
    lab.append(document.createTextNode(metric() ? `${label} (cm)` : label));
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = metric() ? "610" : "240";
    input.step = "1";
    input.value = metric() ? toCm(piece[key]) : Math.round(piece[key]);
    input.addEventListener("focus", () => { focusSnap = snapshot(); });
    input.addEventListener("input", () => {
      const raw = Number(input.value);
      const inches = metric() ? cmToIn(raw) : raw;
      piece[key] = clamp(inches || piece[key], 1, 240);
      clampPiece(state.room, piece);
      draw();
    });
    input.addEventListener("change", () => { commit(focusSnap); renderPieceList(); renderNotes(); renderMaterials(); renderInspector(); });
    lab.append(input);
    if (!metric()) {
      const hint = document.createElement("span");
      hint.className = "fine";
      hint.textContent = fmt(piece[key]);
      lab.append(hint);
    }
    dims.append(lab);
  }

  const clearance = document.createElement("p");
  clearance.className = "fine";
  clearance.id = "clearance";
  clearance.textContent = selectedClearance(piece);

  const photoRow = document.createElement("div");
  photoRow.className = "photo-row";
  if (piece.photo) {
    const img = document.createElement("img");
    img.src = piece.photo;
    img.alt = "";
    photoRow.append(img);
  }
  const file = document.createElement("label");
  file.className = "file";
  file.append(document.createTextNode(piece.photo ? "Replace photo" : "Add a photo"));
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.capture = "environment";
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const before = snapshot();
    piece.photo = await compress(f);
    commit(before);
    sync();
  });
  file.append(fileInput);
  photoRow.append(file);
  if (piece.photo) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Remove photo";
    clear.addEventListener("click", () => {
      const before = snapshot();
      piece.photo = null;
      commit(before);
      sync();
    });
    photoRow.append(clear);
  }
  const photoNote = document.createElement("p");
  photoNote.className = "fine";
  photoNote.textContent = metric()
    ? "The photo stays in this browser. It doesn’t look up a product — measure the piece and type the centimeters."
    : "The photo stays in this browser. It doesn’t look up a product — measure the piece and type the inches.";

  const actions = document.createElement("div");
  actions.className = "row";
  const turn = document.createElement("button");
  turn.type = "button";
  turn.textContent = "Rotate";
  turn.addEventListener("click", () => {
    const before = snapshot();
    rotatePiece(piece);
    commit(before);
    sync();
  });
  const dup = document.createElement("button");
  dup.type = "button";
  dup.textContent = "Duplicate";
  dup.addEventListener("click", () => duplicatePiece(piece));
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "Delete";
  del.addEventListener("click", () => removePiece(piece.id));
  actions.append(turn, dup, del);

  root.append(name, preset, dims, clearance, photoRow, photoNote, actions);
}

function uniqueName(base, ignoreId) {
  const names = new Set(state.pieces.filter((p) => p.id !== ignoreId).map((p) => p.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i += 1;
  return `${base} ${i}`;
}

function addPieceFromCatalog(index) {
  const spec = CATALOG[index];
  if (!spec) return;
  const before = snapshot();
  const piece = {
    id: uid(),
    type: spec.type,
    name: uniqueName(spec.name),
    w: spec.w,
    d: spec.d,
    h: spec.h,
    rot: 0,
    x: 0,
    y: 0,
    photo: null,
  };
  const spot = bestOf(state.room, state.pieces.filter((p) => p.type !== "rug"), piece, candidates(state.room, piece), state.mode, state.pieces);
  Object.assign(piece, spot || { x: 12, y: 12, rot: 0 });
  clampPiece(state.room, piece);
  state.pieces.push(piece);
  state.selectedId = piece.id;
  commit(before);
  sync();
}

function duplicatePiece(piece) {
  const before = snapshot();
  const copy = { ...piece, id: uid(), name: uniqueName(piece.name), x: piece.x + 12, y: piece.y + 12 };
  clampPiece(state.room, copy);
  state.pieces.push(copy);
  state.selectedId = copy.id;
  commit(before);
  sync();
}

function removePiece(id) {
  const before = snapshot();
  state.pieces = state.pieces.filter((p) => p.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  commit(before);
  sync();
}

function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 480;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("photo"));
    };
    img.src = url;
  });
}

function setView(view) {
  state.view = view;
  syncViewChrome();
  save();
  draw();
}

function setMode(mode) {
  state.mode = mode;
  syncViewChrome();
  renderNotes();
  save();
}

function turn(dir) {
  state.corner = (state.corner + dir + 4) % 4;
  if (state.view !== "corners") state.view = "corners";
  syncViewChrome();
  save();
  draw();
}

function readRoomFromInputs() {
  const room = state.room;
  room.name = document.getElementById("room-name").value.trim() || "Room";
  room.w = readDim("room-w-ft", "room-w-in");
  room.d = readDim("room-d-ft", "room-d-in");
  room.h = readDim("room-h-ft", "room-h-in");
  for (const wall of WALLS) room.labels[wall] = document.getElementById(`label-${wall}`).value.trim() || DEFAULT_LABELS[wall];
  normalize(room, state.pieces);
}

function bindRoomInputs() {
  const ids = ["room-name", "room-w-ft", "room-w-in", "room-d-ft", "room-d-in", "room-h-ft", "room-h-in", "label-n", "label-e", "label-s", "label-w"];
  for (const id of ids) {
    const el = document.getElementById(id);
    el.addEventListener("focus", () => { focusSnap = snapshot(); });
    el.addEventListener("input", () => {
      readRoomFromInputs();
      draw();
      updateSqft();
    });
    el.addEventListener("change", () => {
      readRoomFromInputs();
      commit(focusSnap);
      renderOpenings();
      renderNotes();
      draw();
    });
  }
}

function paint(live) {
  draw();
  syncViewChrome();
  if (!live) renderNotes();
  updateHistoryButtons();
  updateSqft();
}

function sync() {
  syncRoomInputs();
  renderOpenings();
  renderMaterials();
  renderLibrary();
  renderPieceList();
  renderInspector();
  paint(false);
}

function boot() {
  const help = document.getElementById("help");
  const helpKey = "layitout-help-v1";
  try {
    if (!localStorage.getItem(helpKey)) help.open = true;
  } catch { /* storage can be blocked */ }
  help.addEventListener("toggle", () => {
    if (!help.open) {
      try { localStorage.setItem(helpKey, "1"); } catch { /* ignore */ }
    }
  });
  document.getElementById("show-help").addEventListener("click", () => {
    help.open = true;
    help.scrollIntoView({ block: "nearest" });
  });
  loadLibrary();
  const saved = load();
  if (saved && saved.units === "metric") state.units = "metric";
  applyDocument(saved || sampleDocument());
  if (saved && saved.libraryId && state.library.some((r) => r.id === saved.libraryId)) state.libraryId = saved.libraryId;
  const add = document.getElementById("add-type");
  let groupName = "";
  let parent = add;
  CATALOG.forEach((item, i) => {
    const g = item.group || "Furniture";
    if (g !== groupName) {
      groupName = g;
      parent = document.createElement("optgroup");
      parent.label = g;
      add.append(parent);
    }
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = item.name;
    parent.append(o);
  });
  bindRoomInputs();

  document.getElementById("openings").addEventListener("input", (e) => {
    const row = e.target.closest(".opening");
    if (!row) return;
    if (!row.dataset.snapped) {
      focusSnap = snapshot();
      row.dataset.snapped = "1";
    }
    readOpeningRow(row);
    normalize(state.room, state.pieces);
    draw();
  });
  document.getElementById("openings").addEventListener("change", (e) => {
    const row = e.target.closest(".opening");
    if (!row) return;
    readOpeningRow(row);
    normalize(state.room, state.pieces);
    commit(focusSnap);
    row.dataset.snapped = "";
    if (e.target.matches("select")) renderOpenings();
    renderNotes();
    draw();
  });
  document.getElementById("openings").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act='remove']");
    if (!btn) return;
    const row = btn.closest(".opening");
    const before = snapshot();
    if (row.dataset.kind === "door") state.room.doors = state.room.doors.filter((d) => d.id !== row.dataset.id);
    if (row.dataset.kind === "window") state.room.windows = state.room.windows.filter((w) => w.id !== row.dataset.id);
    if (row.dataset.kind === "closet") state.room.closets = state.room.closets.filter((c) => c.id !== row.dataset.id);
    commit(before);
    sync();
  });

  document.getElementById("pieces").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    state.selectedId = btn.dataset.id;
    renderPieceList();
    renderInspector();
    draw();
  });

  document.getElementById("add-btn").addEventListener("click", () => {
    addPieceFromCatalog(Number(document.getElementById("add-type").value));
  });
  document.getElementById("add-door").addEventListener("click", () => {
    const before = snapshot();
    const used = new Set(state.room.doors.map((d) => d.wall));
    const wall = WALLS.find((w) => !used.has(w)) || "n";
    state.room.doors.push({ id: uid(), wall, offset: 24, width: 32, height: 80, hinge: "start" });
    normalize(state.room, state.pieces);
    commit(before);
    sync();
  });
  document.getElementById("add-window").addEventListener("click", () => {
    const before = snapshot();
    state.room.windows.push({ id: uid(), wall: "n", offset: 24, width: 36, sill: 36, height: 48 });
    normalize(state.room, state.pieces);
    commit(before);
    sync();
  });
  document.getElementById("add-closet").addEventListener("click", () => {
    const before = snapshot();
    state.room.closets.push({ id: uid(), wall: "e", offset: 12, width: 48, kind: "sliding", hinge: "start", height: 80 });
    normalize(state.room, state.pieces);
    commit(before);
    sync();
  });
  const loadDoc = (doc) => {
    const before = snapshot();
    state.past.push(before);
    state.future = [];
    state.libraryId = null;
    applyDocument(doc);
    state.pristine = true;
    save();
    sync();
  };
  document.getElementById("save-room").addEventListener("click", saveRoomToLibrary);
  document.getElementById("load-sample").addEventListener("click", () => loadDoc(sampleDocument()));
  document.getElementById("load-bath").addEventListener("click", () => loadDoc(sampleBath()));
  document.querySelectorAll("[data-project]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.project === state.room.project) return;
      const before = snapshot();
      state.room.project = btn.dataset.project;
      normalize(state.room, state.pieces);
      commit(before);
      sync();
    });
  });
  document.querySelectorAll("[data-units]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.units === state.units) return;
      state.units = btn.dataset.units === "metric" ? "metric" : "us";
      save();
      sync();
    });
  });
  const onFinish = () => {
    const before = snapshot();
    const remodel = state.room.remodel;
    remodel.floor = document.getElementById("floor-finish").value;
    remodel.wetWalls = document.getElementById("wet-walls").value;
    remodel.tileHeight = Number(document.getElementById("tile-height").value) || remodel.tileHeight;
    normalize(state.room, state.pieces);
    commit(before);
    sync();
  };
  document.getElementById("floor-finish").addEventListener("change", onFinish);
  document.getElementById("wet-walls").addEventListener("change", onFinish);
  document.getElementById("tile-height").addEventListener("change", onFinish);
  document.getElementById("clear-pieces").addEventListener("click", () => {
    const before = snapshot();
    state.pieces = [];
    state.selectedId = null;
    commit(before);
    sync();
  });
  document.getElementById("undo").addEventListener("click", undo);
  document.getElementById("redo").addEventListener("click", redo);
  document.getElementById("suggest").addEventListener("click", () => {
    const before = snapshot();
    state.pieces = arrange(state.room, state.pieces, state.mode);
    normalize(state.room, state.pieces);
    commit(before);
    sync();
  });
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
  document.getElementById("zoom-in").addEventListener("click", () => {
    state.zoom = clamp(state.zoom * 1.15, 0.4, 5);
    draw();
    save();
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    state.zoom = clamp(state.zoom / 1.15, 0.4, 5);
    draw();
    save();
  });
  document.getElementById("zoom-fit").addEventListener("click", () => {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    draw();
    save();
  });
  document.getElementById("turn-left").addEventListener("click", () => turn(-1));
  document.getElementById("turn-right").addEventListener("click", () => turn(1));

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("dragover", (e) => e.preventDefault());
  canvas.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const { mx, my } = eventPoint(e);
    const piece = hitPiece(mx, my) || selected();
    if (!piece) return;
    const before = snapshot();
    piece.photo = await compress(file);
    state.selectedId = piece.id;
    commit(before);
    sync();
  });
  window.addEventListener("keydown", onKey);
  new ResizeObserver(() => draw()).observe(stage);

  sync();
}

boot();
