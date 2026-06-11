/*
 * Vector sprites for the pizzeria, drawn with the batched renderer:
 * pizzas with toppings and bake tint, customers, the oven, topping bins,
 * hearts, and a tiny 3x5 pixel font for in-canvas labels.
 */
"use strict";

const Sprites = (function () {
  const R = Renderer;

  // ---------------------------------------------------------------------
  // Colors
  // ---------------------------------------------------------------------

  const C = {
    crust:     [0.82, 0.62, 0.30, 1],
    crustRaw:  [0.91, 0.80, 0.58, 1],
    dough:     [0.95, 0.87, 0.66, 1],
    sauce:     [0.83, 0.22, 0.13, 1],
    cheese:    [0.97, 0.78, 0.26, 1],
    cheeseRaw: [0.98, 0.92, 0.62, 1],
    pepperoni: [0.72, 0.13, 0.16, 1],
    pepDark:   [0.52, 0.08, 0.11, 1],
    mushroom:  [0.88, 0.78, 0.60, 1],
    mushDark:  [0.62, 0.50, 0.36, 1],
    olive:     [0.16, 0.20, 0.12, 1],
    oliveHole: [0.30, 0.36, 0.20, 1],
    pepper:    [0.22, 0.72, 0.30, 1],
    pepperDk:  [0.13, 0.48, 0.20, 1],
    anchovy:   [0.74, 0.48, 0.36, 1],
    anchoDark: [0.50, 0.28, 0.20, 1],
    onion:     [0.90, 0.85, 0.95, 1],
    onionDk:   [0.68, 0.60, 0.78, 1],
    jalapeno:  [0.92, 0.28, 0.18, 1],
    jalDark:   [0.68, 0.14, 0.10, 1],
    burnt:     [0.16, 0.10, 0.06, 1],
  };

  function lerpC(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
      a[3] + (b[3] - a[3]) * t,
    ];
  }

  function fade(c, alpha) {
    return [c[0], c[1], c[2], c[3] * alpha];
  }

  // ---------------------------------------------------------------------
  // Pizza
  // ---------------------------------------------------------------------

  // Fixed scatter positions per topping, as [angle, radiusFraction], so
  // pizzas look hand-made but identical orders look identical.
  const SPOTS = {
    pepperoni: [[0.2, 0.55], [1.6, 0.52], [3.1, 0.56], [4.5, 0.50], [2.3, 0.22], [5.4, 0.26]],
    mushroom:  [[0.8, 0.52], [2.5, 0.56], [4.0, 0.50], [5.6, 0.54], [1.7, 0.20], [3.4, 0.24]],
    olive:     [[0.4, 0.60], [1.3, 0.30], [2.1, 0.58], [3.0, 0.28], [3.8, 0.60], [4.7, 0.32], [5.5, 0.58]],
    pepper:    [[1.1, 0.55], [2.8, 0.50], [4.6, 0.55], [0.3, 0.26], [3.7, 0.24], [5.8, 0.52]],
    anchovy:   [[0.5, 0.58], [1.8, 0.52], [3.3, 0.56], [4.8, 0.50], [2.6, 0.22], [5.1, 0.28]],
    onion:     [[0.7, 0.50], [2.0, 0.55], [3.5, 0.48], [5.0, 0.52], [1.2, 0.22], [4.3, 0.25]],
    jalapeno:  [[0.3, 0.56], [1.5, 0.50], [2.9, 0.54], [4.2, 0.48], [0.9, 0.24], [3.6, 0.22]],
  };

  // bake: 0 = raw, ~1 = perfect, >1.3 = burnt. rot rotates the toppings.
  function pizza(cx, cy, r, top, bake, rot) {
    bake = bake || 0;
    rot = rot || 0;
    const cook = Math.min(1, Math.max(0, bake));          // raw -> golden
    const burn = Math.min(1, Math.max(0, (bake - 1.1) / 0.35)); // golden -> charcoal

    let crust = lerpC(C.crustRaw, C.crust, cook);
    let dough = C.dough;
    let sauce = C.sauce;
    let cheese = lerpC(C.cheeseRaw, C.cheese, cook);
    if (burn > 0) {
      crust = lerpC(crust, C.burnt, burn);
      dough = lerpC(dough, C.burnt, burn);
      sauce = lerpC(sauce, C.burnt, burn);
      cheese = lerpC(cheese, C.burnt, burn);
    }

    R.circle(cx, cy, r, crust);
    R.circle(cx, cy, r * 0.86, top && top.has("sauce") ? sauce : dough);
    if (top && top.has("cheese")) {
      R.circle(cx, cy, r * 0.78, cheese);
      // melty blobs reaching the sauce edge
      for (let i = 0; i < 5; i++) {
        const a = rot + i * 1.26 + 0.5;
        R.circle(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74, r * 0.1, cheese);
      }
    }
    if (!top) return;

    for (const kind of ["pepperoni", "mushroom", "olive", "pepper", "anchovy", "onion", "jalapeno"]) {
      if (!top.has(kind)) continue;
      for (const [a0, rf] of SPOTS[kind]) {
        const a = a0 + rot;
        const x = cx + Math.cos(a) * r * rf;
        const y = cy + Math.sin(a) * r * rf;
        toppingBit(kind, x, y, r, burn, a);
      }
    }
  }

  function toppingBit(kind, x, y, r, burn, a) {
    if (kind === "pepperoni") {
      R.circle(x, y, r * 0.13, lerpC(C.pepperoni, C.burnt, burn));
      R.circle(x - r * 0.03, y - r * 0.03, r * 0.05, lerpC(C.pepDark, C.burnt, burn));
    } else if (kind === "mushroom") {
      R.circle(x, y, r * 0.11, lerpC(C.mushroom, C.burnt, burn));
      R.rotQuad(x, y, r * 0.07, r * 0.16, a, lerpC(C.mushDark, C.burnt, burn));
    } else if (kind === "olive") {
      R.circle(x, y, r * 0.08, lerpC(C.olive, C.burnt, burn));
      R.circle(x, y, r * 0.035, lerpC(C.oliveHole, C.burnt, burn));
    } else if (kind === "pepper") {
      R.rotQuad(x, y, r * 0.24, r * 0.07, a + 0.8, lerpC(C.pepper, C.burnt, burn));
      R.rotQuad(x, y, r * 0.18, r * 0.04, a + 0.8, lerpC(C.pepperDk, C.burnt, burn));
    } else if (kind === "anchovy") {
      R.rotQuad(x, y, r * 0.30, r * 0.07, a + 0.4, lerpC(C.anchovy, C.burnt, burn));
      R.rotQuad(x + r * 0.04, y - r * 0.03, r * 0.22, r * 0.04, a + 0.4, lerpC(C.anchoDark, C.burnt, burn));
    } else if (kind === "onion") {
      R.circle(x, y, r * 0.12, lerpC(C.onion, C.burnt, burn));
      R.circle(x, y, r * 0.058, lerpC(C.onionDk, C.burnt, burn));
    } else if (kind === "jalapeno") {
      R.circle(x, y, r * 0.10, lerpC(C.jalapeno, C.burnt, burn));
      R.circle(x - r * 0.025, y - r * 0.025, r * 0.04, lerpC(C.jalDark, C.burnt, burn));
      R.circle(x + r * 0.03, y + r * 0.03, r * 0.033, lerpC(C.jalDark, C.burnt, burn));
    }
  }

  // Small standalone icon for bins and tickets.
  function toppingIcon(kind, x, y, s) {
    if (kind === "sauce") {
      R.circle(x, y, s * 0.5, C.sauce);
      R.circle(x - s * 0.14, y - s * 0.14, s * 0.13, [1, 0.55, 0.45, 0.8]);
    } else if (kind === "cheese") {
      // cheese wedge
      R.tri(x - s * 0.5, y + s * 0.4, x + s * 0.5, y + s * 0.4, x + s * 0.1, y - s * 0.45, C.cheese);
      R.circle(x, y + s * 0.12, s * 0.09, C.cheeseRaw);
      R.circle(x + s * 0.22, y + s * 0.26, s * 0.07, C.cheeseRaw);
    } else if (kind === "pepperoni") {
      R.circle(x, y, s * 0.45, C.pepperoni);
      R.circle(x - s * 0.12, y - s * 0.1, s * 0.12, C.pepDark);
      R.circle(x + s * 0.16, y + s * 0.14, s * 0.09, C.pepDark);
    } else if (kind === "mushroom") {
      R.arc(x, y + s * 0.05, 0, s * 0.45, Math.PI, Math.PI * 2, C.mushroom, 12);
      R.quad(x - s * 0.12, y + s * 0.05, s * 0.24, s * 0.4, C.mushDark);
    } else if (kind === "olive") {
      R.circle(x, y, s * 0.4, C.olive);
      R.circle(x, y, s * 0.16, C.oliveHole);
    } else if (kind === "pepper") {
      R.rotQuad(x, y, s * 0.95, s * 0.28, -0.5, C.pepper);
      R.rotQuad(x, y, s * 0.7, s * 0.13, -0.5, C.pepperDk);
    } else if (kind === "anchovy") {
      R.rotQuad(x, y, s * 0.85, s * 0.24, -0.3, C.anchovy);
      R.rotQuad(x + s * 0.06, y - s * 0.06, s * 0.60, s * 0.12, -0.3, C.anchoDark);
    } else if (kind === "onion") {
      R.circle(x, y, s * 0.44, C.onion);
      R.circle(x, y, s * 0.27, [0.13, 0.09, 0.14, 1]);
      R.circle(x, y, s * 0.14, C.onionDk);
    } else if (kind === "jalapeno") {
      R.circle(x, y, s * 0.40, C.jalapeno);
      R.circle(x - s * 0.10, y - s * 0.08, s * 0.13, C.jalDark);
      R.circle(x + s * 0.11, y + s * 0.10, s * 0.10, C.jalDark);
    }
  }

  // ---------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------

  const PALETTES = [
    { body: [0.25, 0.55, 0.95, 1], skin: [1.00, 0.85, 0.66, 1], hair: [0.28, 0.20, 0.13, 1], hat: 0 },
    { body: [0.93, 0.42, 0.62, 1], skin: [0.56, 0.39, 0.27, 1], hair: [0.10, 0.10, 0.12, 1], hat: 1 },
    { body: [0.40, 0.80, 0.50, 1], skin: [0.96, 0.77, 0.60, 1], hair: [0.86, 0.66, 0.26, 1], hat: 2 },
    { body: [0.95, 0.66, 0.25, 1], skin: [0.80, 0.60, 0.45, 1], hair: [0.42, 0.26, 0.50, 1], hat: 0 },
    { body: [0.60, 0.50, 0.95, 1], skin: [1.00, 0.80, 0.62, 1], hair: [0.76, 0.30, 0.20, 1], hat: 1 },
    { body: [0.30, 0.78, 0.78, 1], skin: [0.70, 0.50, 0.35, 1], hair: [0.55, 0.55, 0.58, 1], hat: 2 },
    { body: [0.78, 0.32, 0.30, 1], skin: [0.92, 0.72, 0.55, 1], hair: [0.20, 0.32, 0.24, 1], hat: 1 },
    { body: [0.46, 0.42, 0.62, 1], skin: [0.62, 0.44, 0.30, 1], hair: [0.88, 0.84, 0.78, 1], hat: 0 },
  ];

  const DARK = [0.08, 0.07, 0.10, 1];
  const GOLD = [0.95, 0.78, 0.22, 1];
  const CREAM = [0.97, 0.92, 0.78, 1];

  // mood: 0 happy, 1 neutral, 2 worried, 3 angry. flash > 0 tints red.
  // vip: gold outfit, crown, sparkles. scale: uniform size multiplier (default 1).
  function customer(cx, cy, t, palIdx, mood, flash, vip, scale) {
    const s = scale || 1;
    const pal = PALETTES[palIdx % PALETTES.length];
    const bob = Math.sin(t * 3 + palIdx) * 2;
    const jit = mood >= 3 ? Math.sin(t * 40) * 1.6 : 0;
    const x = cx + jit;
    const y = cy + bob;

    // body
    let body = vip ? GOLD : pal.body;
    if (flash > 0) body = lerpC(body, [1, 0.2, 0.2, 1], Math.min(1, flash));
    R.circle(x - 18*s, y + 16*s, 9*s, body);
    R.circle(x + 18*s, y + 16*s, 9*s, body);
    R.quad(x - 18*s, y + 7*s, 36*s, 22*s, body);
    R.quad(x - 23*s, y + 16*s, 46*s, 13*s, body);
    if (vip) {
      R.rotQuad(x, y + 17*s, 38*s, 5*s, -0.22, CREAM);
    }

    // head
    const hy = y - 12*s;
    R.circle(x, hy, 17*s, pal.skin);

    // hair / hat
    if (pal.hat === 0) {
      R.arc(x, hy, 12*s, 18*s, Math.PI * 1.02, Math.PI * 1.98, pal.hair, 14);
    } else if (pal.hat === 1) {
      R.arc(x, hy - s, 10*s, 18.5*s, Math.PI * 0.95, Math.PI * 2.05, pal.hair, 14);
      R.circle(x - 14*s, hy + 2*s, 4.5*s, pal.hair);
      R.circle(x + 14*s, hy + 2*s, 4.5*s, pal.hair);
    } else {
      R.arc(x, hy - 3*s, 11*s, 17*s, Math.PI, Math.PI * 2, pal.hair, 12);
      R.quad(x - 13*s, hy - 6*s, 26*s, 4*s, pal.hair);
    }

    // VIP crown and twinkles, drawn over the hair
    if (vip) {
      const cyn = hy - 17*s;
      R.quad(x - 8*s, cyn - 2*s, 16*s, 4*s, GOLD);
      R.tri(x - 8*s, cyn - 2*s, x - 5.3*s, cyn - 2*s, x - 6.6*s, cyn - 8*s, GOLD);
      R.tri(x - 1.3*s, cyn - 2*s, x + 1.3*s, cyn - 2*s, x, cyn - 9*s, GOLD);
      R.tri(x + 5.3*s, cyn - 2*s, x + 8*s, cyn - 2*s, x + 6.6*s, cyn - 8*s, GOLD);
      sparkle(x - 24*s, hy - 14*s, 5, t * 1.3 + palIdx);
      sparkle(x + 23*s, hy - 8*s, 4, t * 1.3 + palIdx + 2.1);
    }

    // eyes; blink shut ~0.15s out of every ~3s, staggered per palette
    const ey = hy - s;
    const blink = ((t + palIdx * 0.83) % 3.1) < 0.15;
    if (blink) {
      R.quad(x - 8.6*s, ey + 1.6*s, 4.6*s, 1.4*s, DARK);
      R.quad(x + 4*s, ey + 1.6*s, 4.6*s, 1.4*s, DARK);
    } else {
      R.quad(x - 8*s, ey, 3.4*s, mood >= 2 ? 3*s : 4.4*s, DARK);
      R.quad(x + 4.6*s, ey, 3.4*s, mood >= 2 ? 3*s : 4.4*s, DARK);
    }
    if (mood >= 3) {
      R.rotQuad(x - 6.5*s, ey - 3.4*s, 8*s, 2*s, 0.45, DARK);
      R.rotQuad(x + 6.5*s, ey - 3.4*s, 8*s, 2*s, -0.45, DARK);
    }

    // mouth
    const my = hy + 8*s;
    if (mood === 0) {
      R.arc(x, my - 2*s, 3.6*s, 5.6*s, 0.3, Math.PI - 0.3, DARK, 8);
    } else if (mood === 1) {
      R.quad(x - 4*s, my, 8*s, 2.2*s, DARK);
    } else {
      R.arc(x, my + 5*s, 3.6*s, 5.6*s, Math.PI + 0.3, Math.PI * 2 - 0.3, DARK, 8);
    }

    // steam mark when furious
    if (mood >= 3) {
      const rc = [1, 0.25, 0.3, 0.9];
      R.rotQuad(x + 19*s, hy - 13*s, 9*s, 2.4*s, 0.6, rc);
      R.rotQuad(x + 19*s, hy - 13*s, 9*s, 2.4*s, -0.6, rc);
    }
  }

  // ---------------------------------------------------------------------
  // Stations and props
  // ---------------------------------------------------------------------

  function roundedPanel(x, y, w, h, r, color) {
    R.quad(x + r, y, w - 2 * r, h, color);
    R.quad(x, y + r, w, h - 2 * r, color);
    R.circle(x + r, y + r, r, color, 8);
    R.circle(x + w - r, y + r, r, color, 8);
    R.circle(x + r, y + h - r, r, color, 8);
    R.circle(x + w - r, y + h - r, r, color, 8);
  }

  // glow: 0..1 inner fire, doorPizza optional {top, bake}.
  function oven(x, y, w, h, glow, t) {
    const body = [0.20, 0.16, 0.20, 1];
    const trim = [0.36, 0.28, 0.34, 1];
    roundedPanel(x, y, w, h, 8, trim);
    roundedPanel(x + 3, y + 3, w - 6, h - 6, 6, body);

    // brick arch mouth
    const mx = x + w / 2;
    const mw = w * 0.72;
    const mouthY = y + h * 0.62;
    R.arc(mx, mouthY, 0, mw / 2, Math.PI, Math.PI * 2, [0.05, 0.03, 0.05, 1], 16);
    R.quad(mx - mw / 2, mouthY, mw, h * 0.22, [0.05, 0.03, 0.05, 1]);
    if (glow > 0) {
      const fl = glow * (0.75 + 0.25 * Math.sin(t * 9));
      R.arc(mx, mouthY, 0, mw / 2 - 4, Math.PI, Math.PI * 2, [1.0, 0.45, 0.10, 0.5 * fl], 14);
      R.quad(mx - mw / 2 + 4, mouthY, mw - 8, h * 0.2, [1.0, 0.45, 0.10, 0.5 * fl]);
      R.arc(mx, mouthY + h * 0.05, 0, mw / 4, Math.PI, Math.PI * 2, [1.0, 0.8, 0.25, 0.5 * fl], 10);
    }
    // licking flames once the fire is properly going
    if (glow > 0.5) {
      const fy = mouthY + h * 0.16; // flame baseline inside the mouth
      for (let i = 0; i < 3; i++) {
        const fx = mx + (i - 1) * mw * 0.22;
        // each tongue flickers on its own phase
        const fh = h * (0.16 + 0.05 * Math.sin(t * 11 + i * 2.4)) * glow;
        const sway = Math.sin(t * 7 + i * 1.7) * mw * 0.02;
        const fw = mw * 0.10;
        R.tri(fx - fw, fy, fx + fw, fy, fx + sway, fy - fh, [1.0, 0.45, 0.10, 0.85]);
        R.tri(fx - fw * 0.5, fy, fx + fw * 0.5, fy, fx + sway * 0.6, fy - fh * 0.6, [1.0, 0.85, 0.30, 0.9]);
      }
    }
    // chimney
    R.quad(mx - w * 0.09, y - 12, w * 0.18, 14, trim);
  }

  function plate(cx, cy, r) {
    R.circle(cx, cy, r, [0.85, 0.88, 0.95, 1]);
    R.circle(cx, cy, r * 0.8, [0.72, 0.76, 0.86, 1]);
  }

  function board(cx, cy, r) {
    R.circle(cx, cy, r, [0.55, 0.38, 0.22, 1]);
    R.circle(cx, cy, r * 0.88, [0.66, 0.47, 0.28, 1]);
    R.quad(cx + r * 0.7, cy - 4, r * 0.6, 8, [0.55, 0.38, 0.22, 1]);
  }

  function trashCan(cx, cy, s) {
    const gray = [0.45, 0.48, 0.55, 1];
    const dark = [0.30, 0.32, 0.38, 1];
    R.quad(cx - s * 0.36, cy - s * 0.28, s * 0.72, s * 0.66, gray);
    R.quad(cx - s * 0.44, cy - s * 0.38, s * 0.88, s * 0.12, dark);
    R.quad(cx - s * 0.10, cy - s * 0.5, s * 0.2, s * 0.12, dark);
    R.quad(cx - s * 0.2, cy - s * 0.18, s * 0.08, s * 0.46, dark);
    R.quad(cx + s * 0.12, cy - s * 0.18, s * 0.08, s * 0.46, dark);
  }

  function heart(cx, cy, s, color) {
    R.circle(cx - s * 0.3, cy - s * 0.2, s * 0.34, color, 10);
    R.circle(cx + s * 0.3, cy - s * 0.2, s * 0.34, color, 10);
    R.tri(cx - s * 0.6, cy - s * 0.04, cx + s * 0.6, cy - s * 0.04, cx, cy + s * 0.62, color);
  }

  // 4-point twinkle: two thin crossed bars, pulsing scale and alpha with t.
  // s is the max half-length of a point; reusable for VIPs and celebrations.
  function sparkle(x, y, s, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    if (pulse < 0.08) return; // fully winked out
    const len = s * (0.6 + 0.8 * pulse);
    const c = [1, 0.95, 0.7, 0.35 + 0.6 * pulse];
    R.rotQuad(x, y, len * 2, s * 0.3, 0, c);
    R.rotQuad(x, y, len * 2, s * 0.3, Math.PI / 2, c);
    R.circle(x, y, s * 0.22, [1, 1, 0.9, 0.5 + 0.5 * pulse], 8);
  }

  // ---------------------------------------------------------------------
  // Tiny 3x5 pixel font
  // ---------------------------------------------------------------------

  const FONT = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111",
    "3": "111001111001111", "4": "101101111001001", "5": "111100111001111",
    "6": "111100111101111", "7": "111001001010010", "8": "111101111101111",
    "9": "111101111001111",
    A: "010101111101101", B: "110101110101110", C: "011100100100011",
    D: "110101101101110", E: "111100110100111", F: "111100110100100",
    G: "011100101101011", H: "101101111101101", I: "111010010010111",
    J: "001001001101010", K: "101110100110101", L: "100100100100111",
    M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101011001", R: "110101110110101",
    S: "011100010001110", T: "111010010010010", U: "101101101101111",
    V: "101101101101010", W: "101101111111101", X: "101101010101101",
    Y: "101101010010010", Z: "111001010100111",
    "+": "000010111010000", "-": "000000111000000", "!": "010010010000010",
    "/": "001001010100100", ".": "000000000000010", ":": "000010000010000",
  };

  // Returns width in px. size = pixel cell size. align: "left"|"center"|"right".
  function text(x, y, size, str, color, align) {
    str = String(str).toUpperCase();
    const adv = 4 * size;
    const width = str.length * adv - size;
    if (align === "center") x -= width / 2;
    else if (align === "right") x -= width;
    for (let i = 0; i < str.length; i++) {
      const g = FONT[str[i]];
      if (g) {
        for (let p = 0; p < 15; p++) {
          if (g[p] === "1") {
            R.quad(x + (p % 3) * size, y + Math.floor(p / 3) * size, size, size, color);
          }
        }
      }
      x += adv;
    }
    return width;
  }

  // ---------------------------------------------------------------------
  // Neon "PIZZA" sign
  // ---------------------------------------------------------------------

  const NEON_WORD = "PIZZA";
  const NEON_PINK = [1.0, 0.35, 0.55, 1];

  // Glowing sign centered on (cx, cy). s = font pixel cell size.
  // One letter sputters out briefly now and then, keyed off t.
  function neonSign(cx, cy, s, t) {
    const adv = 4 * s;
    const width = NEON_WORD.length * adv - s;
    const left = cx - width / 2;
    const top = cy - 2.5 * s;

    // soft warm halo behind the lettering
    R.circle(cx, cy, width * 0.75, [1.0, 0.45, 0.35, 0.06], 20);
    R.circle(cx, cy, width * 0.5, [1.0, 0.40, 0.40, 0.09], 18);
    R.quad(left - 2 * s, top - 1.5 * s, width + 4 * s, 8 * s, [1.0, 0.35, 0.45, 0.08]);

    // every ~4s one letter sputters for ~0.4s, cycling through the word
    const phase = t % 4;
    const dimIdx = Math.floor(t / 4) % NEON_WORD.length;
    const sputter = phase < 0.4;

    for (let i = 0; i < NEON_WORD.length; i++) {
      let a = 1;
      if (sputter && i === dimIdx) {
        a = 0.25 + 0.25 * Math.sin(t * 60); // buzzing half-dead tube
      }
      const lx = left + i * adv;
      // dim halo per letter, then the bright core
      text(lx - s * 0.25, top - s * 0.25, s * 1.16, NEON_WORD[i], fade(NEON_PINK, 0.22 * a), "left");
      text(lx, top, s, NEON_WORD[i], fade([1.0, 0.75, 0.8, 1], a), "left");
    }
  }

  return {
    pizza,
    toppingIcon,
    customer,
    oven,
    plate,
    board,
    trashCan,
    heart,
    roundedPanel,
    text,
    sparkle,
    neonSign,
    fade,
    lerpC,
    paletteCount: PALETTES.length,
  };
})();
