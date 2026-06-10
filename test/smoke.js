/* Headless smoke test: stub DOM + WebGL, load the game, play one order. */
"use strict";
const fs = require("fs");
const path = require("path");

// ---- stubs ----------------------------------------------------------------
const glConsts = {
  VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
  ARRAY_BUFFER: 5, DYNAMIC_DRAW: 6, FLOAT: 7, BLEND: 8, ONE: 9,
  ONE_MINUS_SRC_ALPHA: 10, COLOR_BUFFER_BIT: 11, TRIANGLES: 12,
};
const gl = Object.assign({}, glConsts, {
  createShader: () => ({}), shaderSource() {}, compileShader() {},
  getShaderParameter: () => true, createProgram: () => ({}), attachShader() {},
  linkProgram() {}, getProgramParameter: () => true, useProgram() {},
  createBuffer: () => ({}), bindBuffer() {}, bufferData() {},
  getAttribLocation: (() => { let i = 0; return () => i++; })(),
  enableVertexAttribArray() {}, vertexAttribPointer() {},
  getUniformLocation: () => ({}), uniform2f() {}, enable() {}, blendFunc() {},
  viewport() {}, clearColor() {}, clear() {}, bufferSubData() {},
  drawArrays() {},
});

function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, v) => (v ? set.add(c) : set.delete(c)),
    has: (c) => set.has(c),
  };
}

const listeners = { window: {}, canvas: {}, document: {} };
function makeEl(id) {
  return {
    id, hidden: false, textContent: "", style: {},
    classList: makeClassList(),
    addEventListener(type, fn) { (listeners[id] = listeners[id] || {})[type] = fn; },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
}

const canvas = makeEl("canvas");
canvas.clientWidth = 400;
canvas.clientHeight = 800;
canvas.width = 0;
canvas.height = 0;
canvas.getContext = (kind) => (kind === "webgl" ? gl : null);
canvas.addEventListener = (type, fn) => { listeners.canvas[type] = fn; };

const els = {};
for (const id of ["score", "hiscore", "stage", "stage-label", "overlay", "title", "subtitle",
  "prompt", "pausebtn", "pausemenu", "pm-resume", "pm-restart", "pm-sound",
  "pm-quit", "nogl"]) {
  els[id] = makeEl(id);
}

let rafCbs = [];
const store = {};
globalThis.window = {
  devicePixelRatio: 1,
  addEventListener: (type, fn) => { listeners.window[type] = fn; },
};
globalThis.document = {
  hidden: false,
  getElementById: (id) => (id === "game" ? canvas : els[id]),
  addEventListener: (type, fn) => { listeners.document[type] = fn; },
};
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
globalThis.requestAnimationFrame = (cb) => { rafCbs.push(cb); return rafCbs.length; };

// deterministic: rand(a,b) -> a, makeOrder picks 0 extras on day 1
Math.random = () => 0;

// ---- load the game (concatenated so top-level consts share one scope) -----
const base = path.join(__dirname, "..", "js");
const src = ["renderer.js", "sprites.js", "audio.js", "game.js"]
  .map((f) => fs.readFileSync(path.join(base, f), "utf8"))
  .join("\n");
new Function(src)();

// ---- drive ----------------------------------------------------------------
let now = 0;
function pump(seconds) {
  const steps = Math.ceil(seconds / 0.04);
  for (let i = 0; i < steps; i++) {
    now += 40;
    const cbs = rafCbs;
    rafCbs = [];
    for (const cb of cbs) cb(now);
  }
}
function key(k) {
  listeners.window.keydown({ key: k, repeat: false, preventDefault() {} });
}
function tap(x, y) {
  listeners.canvas.pointerdown({ clientX: x, clientY: y });
}
function assert(cond, msg) {
  if (!cond) { console.error("FAIL: " + msg); process.exitCode = 1; }
  else console.log("ok: " + msg);
}

pump(0.2);
assert(els.title.textContent.includes("NEON"), "attract screen shown");

key("Enter"); // start game
assert(els.title.textContent === "DAY 1", "day 1 intro: " + els.title.textContent);
assert(els["stage-label"].textContent === "DAY 1" && els.stage.textContent === "0/6", "HUD shows DAY 1 and 0/6");

pump(2.0); // intro -> play
assert(els.overlay.classList.has("hidden"), "overlay hidden during play");

pump(1.5); // first customer spawns at 0.6s, walks in over 0.6s

// build sauce + cheese (deterministic order has no extras)
key("1");
key("2");
key(" "); // into the oven
pump(0.3); // flight
pump(3.85); // bake into the perfect window (p ~ 0.96)
key(" "); // pull out
pump(0.35); // flight to ready plate
key("q"); // serve customer in slot 0
pump(0.4); // serve flight + payout

const score = Number(els.score.textContent);
assert(score > 100, "paid with tip + perfect bonus, coins = " + score);
assert(Number(els.hiscore.textContent) === score, "hiscore tracks live");

// wrong-order refusal: bake a pepperoni pizza nobody asked for
pump(3.0); // another walk-in
key("1"); key("2"); key("3");
key(" ");
pump(0.3);
pump(3.0); // good zone
key(" ");
pump(0.35);
const before = Number(els.score.textContent);
key("q");
pump(0.3);
assert(Number(els.score.textContent) === before, "wrong order refused, no pay");
key("x"); // trash it
key("q"); // serving with empty hands is a no-op
assert(Number(els.score.textContent) === before, "no-pizza serve is harmless");

// burn one: oven in, wait past the burnt line
key("1"); key("2");
key(" ");
pump(0.3);
pump(6.0); // p = 1.5, burnt + smoke
key(" ");
pump(0.35);
key("q");
assert(Number(els.score.textContent) === before, "burnt pizza refused");
key("x");

// combo path: serve a second customer in a row (slot 1 -> key W)
key("1"); key("2");
key(" ");
pump(0.3);
pump(3.85);
key(" ");
pump(0.35);
key("w");
pump(0.4);
assert(Number(els.score.textContent) > before,
  "second consecutive serve pays (combo), coins = " + els.score.textContent);

// let everyone walk: hearts drain to game over
pump(120);
assert(els.title.textContent === "CLOSED", "game over reached: " + els.title.textContent);
assert(store["pizzeria-hiscore"] !== undefined && Number(store["pizzeria-hiscore"]) >= score,
  "high score persisted: " + store["pizzeria-hiscore"]);

key("Enter"); // back to attract
pump(0.1);
assert(els.title.textContent.includes("NEON"), "returned to title");

// quick restart + pause sanity
key("Enter");
pump(2.1);
key("p");
assert(els.pausemenu.hidden === false, "pause menu opens");
listeners["pm-resume"].click ? null : null;
key("p");
assert(els.pausemenu.hidden === true, "pause menu closes");

console.log(process.exitCode ? "SMOKE TEST FAILED" : "SMOKE TEST PASSED");
