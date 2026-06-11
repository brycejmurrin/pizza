/*
 * Neon Slice — an arcade pizzeria.
 * Customers walk up to the counter with order tickets. Build each pizza
 * from the topping bins, bake it (pull it in the golden window!), and
 * serve the right customer before their patience runs out. Survive the
 * day's quota of orders; every day gets busier and pickier.
 */
"use strict";

(function () {
  const canvas = document.getElementById("game");
  const scoreEl = document.getElementById("score");
  const hiscoreEl = document.getElementById("hiscore");
  const stageEl = document.getElementById("stage");
  const stageLabelEl = document.getElementById("stage-label");
  const overlayEl = document.getElementById("overlay");
  const titleEl = document.getElementById("title");
  const subtitleEl = document.getElementById("subtitle");
  const promptEl = document.getElementById("prompt");
  const pauseBtn = document.getElementById("pausebtn");
  const pauseMenu = document.getElementById("pausemenu");
  const pmResume = document.getElementById("pm-resume");
  const pmRestart = document.getElementById("pm-restart");
  const pmHowto = document.getElementById("pm-howto");
  const pmSound = document.getElementById("pm-sound");
  const pmQuit = document.getElementById("pm-quit");
  const howBtn = document.getElementById("howbtn");
  const howtoEl = document.getElementById("howto");
  const howClose = document.getElementById("how-close");

  let glOk = false;
  try {
    glOk = Renderer.init(canvas);
  } catch (err) {
    glOk = false;
  }
  if (!glOk) {
    document.getElementById("nogl").hidden = false;
    return;
  }

  const HI_KEY = "pizzeria-hiscore";
  const SND_KEY = "pizzeria-sound";

  const BINS = ["sauce", "cheese", "pepperoni", "mushroom", "olive", "pepper", "anchovy", "onion", "jalapeno"];
  const EXTRAS = ["pepperoni", "mushroom", "olive", "pepper", "anchovy", "onion", "jalapeno"];

  // Bake progress p = time / BAKE_TIME. Zones along the bake bar:
  const BAKE_TIME = 4.0;
  const Q_RAW = 0.6;        // below: raw, refused
  const Q_PERFECT_LO = 0.85;
  const Q_PERFECT_HI = 1.1; // [lo, hi]: perfect, tip bonus
  const Q_BURNT = 1.3;      // above: burnt, refused
  const BAR_MAX = 1.5;      // bar/meter range

  const BASE_PAY = 50;
  const TIP_MAX = 50;
  const PERFECT_BONUS = 25;
  const COMBO_STEP = 0.2;  // extra tip per consecutive serve beyond the first
  const COMBO_CAP = 5;     // caps the tip multiplier at x2
  const VIP_DAY = 3;       // VIPs start showing up on this day
  const VIP_CHANCE = 0.18;
  const VIP_DRAIN = 1.3;   // VIP patience drains this much faster
  const RUSH_DAY = 5;
  const RUSH_CHANCE = 0.15;
  const RUSH_DRAIN = 2.0;  // rush customers lose patience twice as fast
  const RUSH_PAY = 1.5;    // but pay 1.5× base
  const DAY_BONUS = 100;
  const HEARTS_MAX = 4;

  // --- Game states ----------------------------------------------------------
  const ST = {
    ATTRACT: 0, // title screen
    INTRO: 1,   // "DAY N"
    PLAY: 2,    // the shift
    CLEAR: 3,   // day complete
    OVER: 4,
  };

  let state = ST.ATTRACT;
  let stateT = 0;
  let worldT = 0; // always-running clock for idle animations

  let day = 1;
  let coins = 0;
  let hiscore = Number(localStorage.getItem(HI_KEY) || 0);
  let hearts = 3;
  let served = 0;
  let streak = 0;       // consecutive successful serves; walkouts reset it
  let dayPerfects = 0;  // per-day stats for the CLEAR screen
  let dayLost = 0;
  let dayBestStreak = 0;
  let DP = dayParams(1);

  // --- Stations ---------------------------------------------------------------
  let prep = new Set();  // toppings on the pizza being built
  let oven = null;       // { top:Set, t, baking, dinged, scorched }
  let readyP = null;     // { top:Set, p, quality, pending }
  let flights = [];      // { kind, x0,y0,x1,y1, t, dur, top, p, cust }

  // --- Customers ----------------------------------------------------------------
  // { slot, x, t, extras:[], order:Set, patience(1->0), state, pal, flash }
  // state: "in" | "wait" | "pending" | "happy" | "angry"
  let customers = [];
  let spawnT = 1;
  let nextPal = Math.floor(Math.random() * Sprites.paletteCount);

  // --- FX -------------------------------------------------------------------
  let floats = [];   // { x, y, t, str, color, size }
  let smoke = [];    // { x, y, t, r }
  let confetti = []; // { x, y, vx, vy, t, color }
  let smokeT = 0;
  let shakeT = 0;

  let paused = false;
  let pauseBtnShown = false;
  let soundOn = localStorage.getItem(SND_KEY) !== "off";
  GameAudio.setMuted(!soundOn);

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }

  // --- Difficulty -------------------------------------------------------------
  function dayParams(d) {
    return {
      quota: Math.min(5 + d, 12),                       // successful serves to clear
      maxCust: Math.min(2 + Math.floor((d - 1) / 2), 4),
      patience: Math.max(30 - (d - 1) * 2, 14),         // seconds at the counter
      spawnGap: Math.max(5 - (d - 1) * 0.4, 2.2),
      extraMin: Math.max(0, Math.min(Math.floor((d - 1) / 3), 2)),
      extraMax: Math.min(1 + Math.floor((d - 1) / 2), 5),
    };
  }

  // --- Layout -----------------------------------------------------------------
  // Recomputed each frame so rotation/resize just works.
  function layout() {
    const W = Renderer.width;
    const H = Renderer.height;

    // Landscape: wide + short (phone on its side, or a desktop window).
    const landscape = W > H * 1.15;
    const narrow = !landscape && W < 620;

    // Vertical anchors — proportional to H so both orientations scale.
    const top = landscape ? 40 : 64;
    const custY = Math.round(H * 0.27);
    const custScale = landscape
      ? clamp(H / 700, 0.9, 1.3)
      : clamp(H / 720, 1.0, 1.35);
    const counterY = custY + (landscape ? 26 : 44);

    // Topping bins: two rows of five in both orientations.
    const binH = landscape ? clamp(Math.round(H * 0.105), 36, 64) : (narrow ? 54 : 64);
    const binGap = landscape ? 16 : 22;
    const binBottom = landscape ? 8 : 10;
    const binAreaH = 2 * (binH + binGap) + 6;
    const binTop = H - binAreaH - binBottom;

    const cellGap = 8;
    const cellW = Math.min((W - 16) / 5 - cellGap, landscape ? 132 : 108);
    const bins = [];
    const items = BINS.concat(["trash"]);
    for (let i = 0; i < items.length; i++) {
      const row = i < 5 ? 0 : 1;
      const idx = i < 5 ? i : i - 5;
      const rowW = 5 * (cellW + cellGap) - cellGap;
      bins.push({
        type: items[i],
        x: W / 2 - rowW / 2 + idx * (cellW + cellGap),
        y: binTop + row * (binH + binGap),
        w: cellW,
        h: binH,
      });
    }

    const midTop = counterY + (landscape ? 28 : 36);
    const midH = binTop - midTop;
    const stationY = midTop + midH * (landscape ? 0.52 : 0.58);
    const pr = clamp(
      Math.min(W * (landscape ? 0.085 : 0.105), midH * (landscape ? 0.32 : 0.22)),
      landscape ? 20 : 26,
      landscape ? 48 : 54
    );

    const ovenW = pr * 2.6;
    const ovenH = pr * 2.3;

    // Inset the queue so edge customers' tickets stay clear of the screen
    // corners and the pause button.
    const slots = [];
    for (let i = 0; i < DP.maxCust; i++) {
      slots.push(W * (0.1 + (0.8 * (i + 0.5)) / DP.maxCust));
    }

    return {
      W, H, top, custY, counterY, bins, binTop,
      stationY, pr, landscape, custScale,
      prepX: W * (landscape ? 0.34 : 0.18),
      ovenX: W * 0.5,
      readyX: W * (landscape ? 0.66 : 0.82),
      ovenW, ovenH,
      ovenRect: { x: W * 0.5 - ovenW / 2, y: stationY - ovenH * 0.62, w: ovenW, h: ovenH },
      slots,
    };
  }

  // --- Helpers ----------------------------------------------------------------
  function quality(p) {
    if (p < Q_RAW) return "raw";
    if (p >= Q_PERFECT_LO && p <= Q_PERFECT_HI) return "perfect";
    if (p > Q_BURNT) return "burnt";
    return "good";
  }

  function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  function updateHud() {
    scoreEl.textContent = coins;
    hiscoreEl.textContent = hiscore;
    const inGame = state !== ST.ATTRACT;
    stageLabelEl.textContent = inGame ? "DAY " + day : "\u00a0";
    stageEl.textContent = inGame ? served + "/" + DP.quota : "\u00a0";
  }

  function showOverlay(title, subtitle, prompt, dead) {
    titleEl.textContent = title;
    titleEl.classList.toggle("dead", !!dead);
    subtitleEl.textContent = subtitle || "";
    promptEl.textContent = prompt || "";
    promptEl.style.display = prompt ? "" : "none";
    howBtn.hidden = true; // only the attract screen unhides it
    overlayEl.classList.remove("hidden");
  }

  function hideOverlay() {
    overlayEl.classList.add("hidden");
  }

  function addFloat(x, y, str, color, size) {
    floats.push({ x, y, t: 0, str, color, size: size || 4 });
  }

  // --- Customers ----------------------------------------------------------------
  function makeOrder() {
    const k = Math.round(rand(DP.extraMin, DP.extraMax));
    const pool = EXTRAS.slice();
    const extras = [];
    for (let i = 0; i < k && pool.length; i++) {
      extras.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return extras;
  }

  function freeSlot() {
    const used = new Set(customers.map((c) => c.slot));
    for (let i = 0; i < DP.maxCust; i++) if (!used.has(i)) return i;
    return -1;
  }

  function spawnCustomer() {
    const slot = freeSlot();
    if (slot < 0) return;
    const extras = makeOrder();
    nextPal = (nextPal + 1 + Math.floor(Math.random() * 2)) % Sprites.paletteCount;
    const vip = day >= VIP_DAY && Math.random() < VIP_CHANCE;
    const rush = !vip && day >= RUSH_DAY && Math.random() < RUSH_CHANCE;
    customers.push({
      slot,
      x: -60,
      t: 0,
      extras,
      order: new Set(["sauce", "cheese"].concat(extras)),
      patience: 1,
      state: "in",
      pal: nextPal,
      flash: 0,
      vip,
      rush,
    });
    if (vip && GameAudio.vip) GameAudio.vip();
  }

  function mood(c) {
    if (c.state === "happy") return 0;
    if (c.state === "angry") return 3;
    if (c.patience > 0.55) return 0;
    if (c.patience > 0.3) return 1;
    if (c.patience > 0.15) return 2;
    return 3;
  }

  // --- Actions ----------------------------------------------------------------
  function binAction(type) {
    if (type === "trash") return trashAction();
    if (prep.has(type)) {
      prep.delete(type);
      GameAudio.pluck();
    } else {
      prep.add(type);
      GameAudio.plop();
    }
  }

  function ovenAction() {
    const L = layout();
    if (!oven) {
      if (prep.size === 0) {
        GameAudio.buzz();
        addFloat(L.ovenX, L.ovenRect.y - 26, "EMPTY!", [1, 0.4, 0.4, 1], 3);
        return;
      }
      oven = { top: new Set(prep), t: 0, baking: false, dinged: false, scorched: false };
      prep = new Set();
      GameAudio.whoosh();
      flights.push({
        kind: "toOven",
        x0: L.prepX, y0: L.stationY,
        x1: L.ovenX, y1: L.stationY - 6,
        t: 0, dur: 0.28,
        top: oven.top, p: 0,
      });
    } else if (oven.baking) {
      if (readyP) {
        GameAudio.buzz();
        addFloat(L.readyX, L.stationY - L.pr - 20, "FULL!", [1, 0.4, 0.4, 1], 3);
        return;
      }
      const p = oven.t / BAKE_TIME;
      const q = quality(p);
      readyP = { top: oven.top, p, quality: q, pending: true };
      oven = null;
      GameAudio.pullOut();
      flights.push({
        kind: "toReady",
        x0: L.ovenX, y0: L.stationY - 6,
        x1: L.readyX, y1: L.stationY,
        t: 0, dur: 0.28,
        top: readyP.top, p,
      });
    }
  }

  function trashAction() {
    const L = layout();
    if (readyP && !readyP.pending) {
      readyP = null;
      GameAudio.trash();
      addFloat(L.readyX, L.stationY - L.pr - 16, "TRASHED", [0.7, 0.7, 0.75, 1], 3);
    } else if (prep.size > 0) {
      prep = new Set();
      GameAudio.trash();
    } else {
      GameAudio.buzz();
    }
  }

  function refuse(c, label) {
    GameAudio.buzz();
    c.flash = 0.7;
    c.patience = Math.max(0.02, c.patience - 0.12);
    shakeT = 0.15;
    const L = layout();
    addFloat(L.slots[c.slot], L.custY - 78, label, [1, 0.35, 0.35, 1], 3.5);
  }

  function serveAction(c) {
    if (c.state !== "wait") return;
    if (!readyP || readyP.pending) {
      GameAudio.tap();
      return;
    }
    if (readyP.quality === "raw") return refuse(c, "RAW!");
    if (readyP.quality === "burnt") return refuse(c, "BURNT!");
    if (!setsEqual(readyP.top, c.order)) return refuse(c, "WRONG ORDER!");

    const L = layout();
    c.state = "pending";
    flights.push({
      kind: "serve",
      x0: L.readyX, y0: L.stationY,
      x1: L.slots[c.slot], y1: L.custY + 8,
      t: 0, dur: 0.3,
      top: readyP.top, p: readyP.p,
      cust: c, q: readyP.quality,
    });
    readyP = null;
  }

  function completeServe(fl) {
    const c = fl.cust;
    const L = layout();
    streak++;
    if (streak > dayBestStreak) dayBestStreak = streak;
    const mult = 1 + COMBO_STEP * Math.min(streak - 1, COMBO_CAP);
    const tip = Math.round(TIP_MAX * c.patience * mult);
    const bonus = fl.q === "perfect" ? PERFECT_BONUS : 0;
    if (bonus) dayPerfects++;
    const basePay = c.rush ? Math.round(BASE_PAY * RUSH_PAY) : BASE_PAY;
    let gain = basePay + tip + bonus;
    if (c.vip) gain *= 2;
    coins += gain;
    if (coins > hiscore) hiscore = coins;
    updateHud();
    GameAudio.cash();
    const x = L.slots[c.slot];
    addFloat(x, L.custY - 70, "+" + gain, [1, 0.85, 0.3, 1], 4);
    let fy = L.custY - 96;
    if (bonus) {
      GameAudio.ding();
      addFloat(x, fy, "PERFECT!", [0.4, 1, 0.6, 1], 3.5);
      fy -= 20;
    }
    if (streak >= 2) {
      addFloat(x, fy, "COMBO X" + streak, [1, 0.6, 0.2, 1], 3.5);
      if (GameAudio.combo) GameAudio.combo(streak);
      fy -= 20;
    }
    if (c.vip) {
      addFloat(x, fy, "VIP X2", [0.95, 0.78, 0.22, 1], 3.5);
    } else if (c.rush) {
      addFloat(x, fy, "RUSH PAY", [1, 0.45, 0.2, 1], 3.5);
    }
    c.state = "happy";
    c.t = 0;
    served++;
    if (served >= DP.quota) dayClear();
  }

  function loseCustomer(c) {
    c.state = "angry";
    c.t = 0;
    GameAudio.angry();
    shakeT = 0.3;
    hearts--;
    streak = 0;
    dayLost++;
    const L = layout();
    addFloat(L.slots[c.slot], L.custY - 70, "-1", [1, 0.3, 0.4, 1], 4);
    if (hearts <= 0) gameOver();
  }

  // --- State transitions --------------------------------------------------------
  function startGame() {
    coins = 0;
    hearts = 3;
    day = 1;
    streak = 0;
    startDay();
    if (!pauseBtnShown) {
      pauseBtn.hidden = false;
      pauseBtnShown = true;
    }
  }

  function startDay() {
    DP = dayParams(day);
    served = 0;
    customers = [];
    flights = [];
    floats = [];
    smoke = [];
    prep = new Set();
    oven = null;
    readyP = null;
    spawnT = 0.6;
    dayPerfects = 0;
    dayLost = 0;
    dayBestStreak = 0;
    state = ST.INTRO;
    stateT = 0;
    updateHud();
    showOverlay("DAY " + day, "Serve " + DP.quota + " customers", "");
    if (GameAudio.musicStop) GameAudio.musicStop();
    GameAudio.dayIntro();
  }

  function beginShift() {
    state = ST.PLAY;
    stateT = 0;
    hideOverlay();
    if (GameAudio.musicStart) GameAudio.musicStart(day);
  }

  function dayClear() {
    state = ST.CLEAR;
    stateT = 0;
    coins += DAY_BONUS;
    if (coins > hiscore) hiscore = coins;
    const gained = hearts < HEARTS_MAX;
    if (gained) {
      hearts++;
      if (GameAudio.heartGain) GameAudio.heartGain();
    }
    updateHud();
    for (const c of customers) {
      if (c.state === "wait" || c.state === "in") {
        c.state = "happy";
        c.t = 0;
      }
    }
    const L = layout();
    for (let i = 0; i < 40; i++) {
      confetti.push({
        x: rand(0, L.W),
        y: rand(-L.H * 0.3, 0),
        vx: rand(-30, 30),
        vy: rand(60, 160),
        t: 0,
        color: [rand(0.4, 1), rand(0.4, 1), rand(0.4, 1), 1],
      });
    }
    showOverlay(
      "DAY " + day + " CLEAR",
      "+" + DAY_BONUS + " coins" + (gained ? "  ·  +1 heart" : "") +
        "\n" + dayPerfects + " perfect  ·  " + dayLost + " lost  ·  best combo x" +
        dayBestStreak,
      ""
    );
    GameAudio.dayClear();
  }

  function gameOver() {
    state = ST.OVER;
    stateT = 0;
    if (GameAudio.musicStop) GameAudio.musicStop();
    if (coins > Number(localStorage.getItem(HI_KEY) || 0)) {
      localStorage.setItem(HI_KEY, String(hiscore));
    }
    updateHud();
    showOverlay("CLOSED", "The customers gave up on you.\nFinal haul: " + coins + " coins", "TAP TO CONTINUE", true);
    GameAudio.gameOver();
  }

  function toAttract() {
    state = ST.ATTRACT;
    stateT = 0;
    if (GameAudio.musicStop) GameAudio.musicStop();
    customers = [];
    flights = [];
    floats = [];
    smoke = [];
    confetti = [];
    prep = new Set();
    oven = null;
    readyP = null;
    updateHud();
    showOverlay(
      "NEON\u00a0SLICE",
      "Build the order · bake it golden · serve it hot",
      "TAP TO START"
    );
    howBtn.hidden = false;
    pauseBtn.hidden = true;
    pauseBtnShown = false;
  }

  // --- Instructions panel -------------------------------------------------------
  function openHowto() {
    howtoEl.hidden = false;
  }

  function closeHowto() {
    howtoEl.hidden = true;
  }

  howBtn.addEventListener("click", () => {
    GameAudio.unlock();
    GameAudio.tap();
    openHowto();
  });
  pmHowto.addEventListener("click", openHowto);
  howClose.addEventListener("click", () => {
    GameAudio.tap();
    closeHowto();
  });

  // --- Pause ------------------------------------------------------------------
  function openPause() {
    if (state !== ST.PLAY || paused) return;
    paused = true;
    pauseMenu.hidden = false;
    pmSound.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";
    if (GameAudio.musicStop) GameAudio.musicStop();
  }

  function closePause() {
    paused = false;
    pauseMenu.hidden = true;
    if (state === ST.PLAY && GameAudio.musicStart) GameAudio.musicStart(day);
  }

  pauseBtn.addEventListener("click", () => {
    GameAudio.unlock();
    openPause();
  });
  pmResume.addEventListener("click", closePause);
  pmRestart.addEventListener("click", () => {
    closePause();
    startGame();
  });
  pmSound.addEventListener("click", () => {
    soundOn = !soundOn;
    GameAudio.setMuted(!soundOn);
    localStorage.setItem(SND_KEY, soundOn ? "on" : "off");
    pmSound.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";
  });
  pmQuit.addEventListener("click", () => {
    closePause();
    toAttract();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) openPause();
  });

  // --- Update -----------------------------------------------------------------
  function update(dt) {
    worldT += dt;
    stateT += dt;

    if (state === ST.INTRO) {
      if (stateT >= 1.8) beginShift();
      return;
    }
    if (state === ST.CLEAR) {
      updateCustomers(dt);
      updateFx(dt);
      if (stateT >= 3) {
        day++;
        startDay();
      }
      return;
    }
    if (state !== ST.PLAY) {
      updateFx(dt);
      return;
    }

    // spawn walk-ins
    spawnT -= dt;
    const active = customers.filter((c) => c.state === "in" || c.state === "wait" || c.state === "pending").length;
    if (spawnT <= 0 && active < DP.maxCust) {
      spawnCustomer();
      spawnT = DP.spawnGap * rand(0.8, 1.2);
    }

    updateCustomers(dt);

    // oven
    if (oven && oven.baking) {
      oven.t += dt;
      const p = oven.t / BAKE_TIME;
      if (!oven.dinged && p >= Q_PERFECT_LO) {
        oven.dinged = true;
        GameAudio.ding();
      }
      if (p > Q_BURNT) {
        if (!oven.scorched) {
          oven.scorched = true;
          GameAudio.sizzle();
        }
        smokeT -= dt;
        if (smokeT <= 0) {
          const L = layout();
          smoke.push({ x: L.ovenX + rand(-14, 14), y: L.ovenRect.y - 4, t: 0, r: rand(5, 9) });
          smokeT = 0.14;
        }
      }
    }

    // flights
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t += dt;
      if (f.t >= f.dur) {
        flights.splice(i, 1);
        if (f.kind === "toOven" && oven) oven.baking = true;
        else if (f.kind === "toReady" && readyP) readyP.pending = false;
        else if (f.kind === "serve") completeServe(f);
      }
    }

    updateFx(dt);
  }

  function updateCustomers(dt) {
    for (let i = customers.length - 1; i >= 0; i--) {
      const c = customers[i];
      c.flash = Math.max(0, c.flash - dt * 1.6);
      const L = layout();
      const sx = L.slots[c.slot];
      if (c.state === "in") {
        c.t += dt;
        const k = easeOut(clamp(c.t / 0.6, 0, 1));
        c.x = -60 + (sx + 60) * k;
        if (k >= 1) {
          c.state = "wait";
          c.x = sx;
        }
      } else if (c.state === "wait") {
        c.x = sx;
        if (state === ST.PLAY) {
          c.patience -= dt * (c.vip ? VIP_DRAIN : c.rush ? RUSH_DRAIN : 1) / DP.patience;
          if (c.patience <= 0) {
            c.patience = 0;
            loseCustomer(c);
          }
        }
      } else if (c.state === "happy" || c.state === "angry") {
        c.t += dt;
        c.x += (c.state === "happy" ? 240 : 320) * dt;
        if (c.x > L.W + 80) customers.splice(i, 1);
      }
      // "pending": frozen in place while the pizza flies over
    }
  }

  function updateFx(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      f.y -= 28 * dt;
      if (f.t > 1.2) floats.splice(i, 1);
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.t += dt;
      s.y -= 36 * dt;
      s.x += Math.sin(s.t * 5 + s.r) * 12 * dt;
      if (s.t > 1.4) smoke.splice(i, 1);
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.t > 4 || p.y > Renderer.height + 10) confetti.splice(i, 1);
    }
    shakeT = Math.max(0, shakeT - dt);
  }

  // --- Drawing ----------------------------------------------------------------
  const BG = [0.055, 0.03, 0.05];
  const WALL = [0.10, 0.05, 0.09, 1];
  const FLOOR_A = [0.085, 0.05, 0.075, 1];
  const FLOOR_B = [0.105, 0.063, 0.09, 1];
  const COUNTER = [0.42, 0.26, 0.14, 1];
  const COUNTER_TOP = [0.55, 0.36, 0.19, 1];
  const TICKET_BG = [0.96, 0.94, 0.86, 1];
  const LABEL = [1, 0.65, 0.35, 0.85];

  function drawScene(L) {
    // wall + checkered floor
    Renderer.quad(0, 0, L.W, L.counterY, WALL);
    const tile = 44;
    for (let ty = 0; ty * tile < L.H - L.counterY; ty++) {
      for (let tx = 0; tx * tile < L.W; tx++) {
        Renderer.quad(tx * tile, L.counterY + ty * tile, tile, tile, (tx + ty) % 2 ? FLOOR_A : FLOOR_B);
      }
    }
  }

  function drawCounter(L) {
    const lip = L.landscape ? 8 : 12;
    const band = L.landscape ? 16 : 26;
    Renderer.quad(0, L.counterY, L.W, lip, COUNTER_TOP);
    Renderer.quad(0, L.counterY + lip, L.W, band, COUNTER);
  }

  function drawCustomers(L) {
    for (const c of customers) {
      Sprites.customer(c.x, L.custY, worldT, c.pal, mood(c), c.flash, c.vip, L.custScale);
    }
    drawCounter(L);
    // tickets drawn over the counter so they never collide with heads
    for (const c of customers) {
      if (c.state !== "wait" && c.state !== "pending" && c.state !== "in") continue;
      drawTicket(c, L);
    }
  }

  function drawTicket(c, L) {
    // Ticket sizes to the queue spacing so neighbours never overlap;
    // the order pizza fills most of the card so it reads at a glance.
    const gap = (L.W * 0.8) / DP.maxCust;
    const w = clamp(Math.round(gap - 12), 56, L.landscape ? 74 : 92);
    const h = Math.round(w * 1.12);
    const x = c.x - w / 2;
    const y = Math.max(6, L.custY - Math.round(52 * L.custScale) - h);
    Sprites.roundedPanel(x - 2, y - 2, w + 4, h + 4, 5, [0, 0, 0, 0.45]);
    if (c.vip) {
      Sprites.roundedPanel(x - 3, y - 3, w + 6, h + 6, 5, [0.95, 0.78, 0.22, 0.95]);
    } else if (c.rush) {
      Sprites.roundedPanel(x - 3, y - 3, w + 6, h + 6, 5, [1.0, 0.35, 0.15, 0.95]);
    }
    Sprites.roundedPanel(x, y, w, h, 4, TICKET_BG);
    Sprites.pizza(c.x, y + h * 0.44, w * 0.40, c.order, 1, c.slot * 1.3);
    // patience bar
    const pw = (w - 10) * clamp(c.patience, 0, 1);
    const pc = c.patience > 0.5
      ? [0.3, 0.85, 0.4, 1]
      : c.patience > 0.25 ? [1, 0.75, 0.2, 1] : [1, 0.25, 0.3, 1];
    Renderer.quad(x + 5, y + h - 13, w - 10, 8, [0, 0, 0, 0.25]);
    Renderer.quad(x + 5, y + h - 13, pw, 8, pc);
    // pointer tail
    Renderer.tri(c.x - 7, y + h, c.x + 7, y + h, c.x, y + h + 9, TICKET_BG);
  }

  function drawStations(L) {
    // PREP
    Sprites.board(L.prepX, L.stationY, L.pr * 1.25);
    Sprites.pizza(L.prepX, L.stationY, L.pr, prep, 0, 0);
    Sprites.text(L.prepX, L.stationY + L.pr * 1.25 + 10, 2.4, "PREP", LABEL, "center");

    // OVEN
    const o = L.ovenRect;
    const baking = oven && oven.baking;
    const p = baking ? oven.t / BAKE_TIME : 0;
    Sprites.oven(o.x, o.y, o.w, o.h, baking ? clamp(0.3 + p * 0.7, 0, 1) : 0.12, worldT);
    if (baking) {
      Sprites.pizza(L.ovenX, o.y + o.h * 0.62, o.w * 0.26, oven.top, p, 0.4);
    }
    Sprites.text(L.ovenX, o.y + o.h + 10, 2.4, baking ? "TAP TO PULL" : "OVEN", LABEL, "center");
    drawBakeBar(L, p, baking);

    // READY
    Sprites.plate(L.readyX, L.stationY, L.pr * 1.2);
    if (readyP && !readyP.pending) {
      Sprites.pizza(L.readyX, L.stationY, L.pr, readyP.top, readyP.p, 0.9);
      const q = readyP.quality;
      const qc = q === "perfect" ? [0.4, 1, 0.6, 1]
        : q === "good" ? [1, 0.85, 0.3, 1] : [1, 0.35, 0.35, 1];
      Sprites.text(L.readyX, L.stationY + L.pr * 1.25 + 10, 2.4, q, qc, "center");
    } else {
      Sprites.text(L.readyX, L.stationY + L.pr * 1.25 + 10, 2.4, "READY", LABEL, "center");
    }
  }

  function drawBakeBar(L, p, baking) {
    const o = L.ovenRect;
    const bw = o.w * 1.15;
    const bx = L.ovenX - bw / 2;
    const by = o.y - 18;
    // raw -> good -> perfect -> overdone (still servable) -> burnt:
    // a single gray/green/gold/amber/red progression so the bar reads
    // left-to-right without the confusing repeated green.
    const zones = [
      [0, Q_RAW, [0.4, 0.4, 0.45, 1]],
      [Q_RAW, Q_PERFECT_LO, [0.25, 0.65, 0.3, 1]],
      [Q_PERFECT_LO, Q_PERFECT_HI, [1, 0.8, 0.2, 1]],
      [Q_PERFECT_HI, Q_BURNT, [0.95, 0.5, 0.12, 1]],
      [Q_BURNT, BAR_MAX, [0.8, 0.2, 0.2, 1]],
    ];
    const alpha = baking ? 1 : 0.3;
    for (const [a, b, col] of zones) {
      Renderer.quad(bx + (a / BAR_MAX) * bw, by, ((b - a) / BAR_MAX) * bw, 8, Sprites.fade(col, alpha));
    }
    if (baking) {
      const mx = bx + clamp(p / BAR_MAX, 0, 1) * bw;
      Renderer.tri(mx - 6, by - 8, mx + 6, by - 8, mx, by - 1, [1, 1, 1, 1]);
    }
  }

  function drawBins(L) {
    for (const b of L.bins) {
      const active = b.type !== "trash" && prep.has(b.type);
      const border = active ? [1, 0.75, 0.25, 0.95] : [0.45, 0.3, 0.45, 0.6];
      Sprites.roundedPanel(b.x - 2, b.y - 2, b.w + 4, b.h + 4, 8, border);
      Sprites.roundedPanel(b.x, b.y, b.w, b.h, 6, active ? [0.22, 0.13, 0.10, 1] : [0.13, 0.09, 0.14, 1]);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const lblSize = L.landscape ? 1.5 : 2;
      if (b.type === "trash") {
        Sprites.trashCan(cx, cy, b.h * 0.7);
        Sprites.text(cx, b.y + b.h + 5, lblSize, "TRASH", LABEL, "center");
      } else {
        const s = b.h * 0.52;
        Sprites.toppingIcon(b.type, cx - s * 0.3, cy + s * 0.12, s * 0.8);
        Sprites.toppingIcon(b.type, cx + s * 0.34, cy - s * 0.1, s * 0.9);
        Sprites.text(cx, b.y + b.h + 5, lblSize, b.type, LABEL, "center");
      }
    }
  }

  // Reputation hearts sit on the counter band, out of the busy top corners.
  function drawHearts(L) {
    const y = L.counterY + (L.landscape ? 12 : 19);
    const s = L.landscape ? 9 : 12.5;
    for (let i = 0; i < HEARTS_MAX; i++) {
      const on = i < hearts;
      Sprites.heart(20 + i * (s * 2.2), y, s, [0.16, 0.09, 0.05, 1]);
      Sprites.heart(20 + i * (s * 2.2), y, s * 0.88, on ? [1, 0.25, 0.4, 1] : [0.32, 0.21, 0.14, 1]);
    }
  }

  function drawFlights() {
    for (const f of flights) {
      const k = easeOut(clamp(f.t / f.dur, 0, 1));
      const x = f.x0 + (f.x1 - f.x0) * k;
      const y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 30;
      Sprites.pizza(x, y, 28, f.top, f.p, k * 2);
    }
  }

  function drawFx() {
    for (const s of smoke) {
      const a = clamp(1 - s.t / 1.4, 0, 1) * 0.4;
      Renderer.circle(s.x, s.y, s.r * (1 + s.t), [0.6, 0.6, 0.65, a], 10);
    }
    for (const p of confetti) {
      Renderer.rotQuad(p.x, p.y, 7, 4, p.t * 6, p.color);
    }
    for (const f of floats) {
      const a = clamp(1.2 - f.t, 0, 1);
      Sprites.text(f.x, f.y, f.size, f.str, Sprites.fade(f.color, a), "center");
    }
  }

  function drawAttract(L) {
    // neon shop sign high on the wall, clear of the centered title text
    // (anchored to H, not custY, which sits much lower during play)
    if (Sprites.neonSign) {
      const signY = Math.max(100, L.H * (L.landscape ? 0.2 : 0.13));
      Sprites.neonSign(L.W / 2, signY, clamp(L.W * 0.028, 7, 13), worldT);
    }
    // slowly spinning supreme pizza, centered below the overlay text
    const r = Math.min(L.W * 0.16, L.H * 0.13);
    const cy = L.H * 0.82;
    Renderer.circle(L.W / 2, cy, r * 1.35, [1, 0.5, 0.15, 0.07], 32);
    Sprites.pizza(L.W / 2, cy, r,
      new Set(["sauce", "cheese", "pepperoni", "mushroom", "olive", "pepper", "anchovy", "onion", "jalapeno"]),
      1, worldT * 0.35);
  }

  function draw() {
    Renderer.clear(BG[0], BG[1], BG[2]);
    if (shakeT > 0) {
      Renderer.setOffset(rand(-1, 1) * shakeT * 22, rand(-1, 1) * shakeT * 22);
    } else {
      Renderer.setOffset(0, 0);
    }

    const L = layout();

    if (state === ST.ATTRACT) {
      // The title screen splits wall/floor lower than gameplay so the
      // neon sign and title text get the wall, and the pizza the floor.
      const LA = Object.assign({}, L, { counterY: Math.round(L.H * 0.62) });
      drawScene(LA);
      drawCounter(LA);
      drawAttract(LA);
    } else {
      drawScene(L);
      drawCustomers(L);
      drawStations(L);
      drawBins(L);
      drawHearts(L);
      drawFlights();
    }
    drawFx();
    Renderer.flush();
  }

  // --- Input ------------------------------------------------------------------
  function hitTest(x, y) {
    const L = layout();
    for (const b of L.bins) {
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 18) {
        return { kind: "bin", type: b.type };
      }
    }
    const o = L.ovenRect;
    if (x >= o.x - 8 && x <= o.x + o.w + 8 && y >= o.y - 26 && y <= o.y + o.h + 16) {
      return { kind: "oven" };
    }
    for (const c of customers) {
      if (c.state !== "wait") continue;
      const hw = Math.round(50 * L.custScale);
      // top bound covers the (taller) ticket as well as the customer
      if (Math.abs(x - c.x) < hw && y > L.custY - Math.round(160 * L.custScale) && y < L.counterY + 30) {
        return { kind: "customer", cust: c };
      }
    }
    return null;
  }

  function pointerDown(e) {
    GameAudio.unlock();
    if (paused || !howtoEl.hidden) return;
    if (state === ST.ATTRACT) {
      GameAudio.coin();
      startGame();
      return;
    }
    if (state === ST.OVER) {
      if (stateT > 0.8) toAttract();
      return;
    }
    if (state !== ST.PLAY) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTest(x, y);
    if (!hit) return;
    if (hit.kind === "bin") binAction(hit.type);
    else if (hit.kind === "oven") ovenAction();
    else if (hit.kind === "customer") serveAction(hit.cust);
  }

  canvas.addEventListener("pointerdown", pointerDown);

  const SERVE_KEYS = { q: 0, w: 1, e: 2, r: 3 };

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (!howtoEl.hidden) {
      // any dismiss-ish key closes the instructions panel
      if (k === "escape" || k === "enter" || k === " " || k === "p") {
        closeHowto();
        e.preventDefault();
      }
      return;
    }
    if (k === "escape" || k === "p") {
      if (state === ST.PLAY) {
        GameAudio.unlock();
        if (paused) closePause();
        else openPause();
      }
      return;
    }
    if (paused) return;
    if (state === ST.ATTRACT && (k === "enter" || k === " ")) {
      GameAudio.unlock();
      GameAudio.coin();
      startGame();
      e.preventDefault();
      return;
    }
    if (state === ST.OVER && (k === "enter" || k === " ")) {
      if (stateT > 0.8) toAttract();
      e.preventDefault();
      return;
    }
    if (state !== ST.PLAY) return;
    GameAudio.unlock();
    const num = parseInt(k, 10);
    if (num >= 1 && num <= BINS.length) {
      binAction(BINS[num - 1]);
    } else if (k === " " || k === "b") {
      ovenAction();
      e.preventDefault();
    } else if (k === "x" || k === "t") {
      trashAction();
    } else if (k in SERVE_KEYS) {
      const slot = SERVE_KEYS[k];
      const c = customers.find((cc) => cc.slot === slot && cc.state === "wait");
      if (c) serveAction(c);
    }
  });

  window.addEventListener("resize", () => Renderer.resize());
  window.addEventListener("orientationchange", () => {
    setTimeout(() => Renderer.resize(), 250);
  });

  // --- Main loop --------------------------------------------------------------
  let last = 0;

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    if (!paused) update(dt);
    draw();
  }

  toAttract();
  updateHud();
  requestAnimationFrame((ts) => {
    last = ts;
    requestAnimationFrame(frame);
  });
})();
