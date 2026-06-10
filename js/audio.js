/*
 * Synthesized sound effects for the pizzeria game.
 * All audio is generated with the Web Audio API (no assets).
 * Every public function is a safe no-op until unlock() has been
 * called from a user gesture (and on browsers without Web Audio).
 */
"use strict";

const GameAudio = (function () {
  const MASTER_GAIN = 0.25;
  const MIN_FREQ = 0.0001; // exponentialRamp targets must be > 0

  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let isMuted = false;

  // ---------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------

  function unlock() {
    try {
      if (!ctx) {
        const AC =
          (typeof window !== "undefined" &&
            (window.AudioContext || window.webkitAudioContext)) ||
          null;
        if (!AC) return;
        // iOS 17+: play through the ring/silent switch like a game should.
        try {
          if (typeof navigator !== "undefined" && navigator.audioSession) {
            navigator.audioSession.type = "playback";
          }
        } catch (e) { /* older iOS */ }
        ctx = new AC();

        master = ctx.createGain();
        master.gain.value = isMuted ? 0 : MASTER_GAIN;
        master.connect(ctx.destination);

        noiseBuffer = makeNoiseBuffer();
      }
      // iOS Safari starts contexts suspended (or leaves them "interrupted"
      // after backgrounding); resume inside the gesture.
      if (ctx.state !== "running" && typeof ctx.resume === "function") {
        ctx.resume();
      }
    } catch (e) {
      ctx = null;
      master = null;
    }
  }

  function ready() {
    return !!(ctx && master);
  }

  function makeNoiseBuffer() {
    const len = Math.max(1, Math.floor(ctx.sampleRate * 1.0));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function setMuted(muted) {
    isMuted = !!muted;
    try {
      if (master) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(isMuted ? 0 : MASTER_GAIN, ctx.currentTime);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function safeFreq(f) {
    return Math.max(MIN_FREQ, f || MIN_FREQ);
  }

  // ---------------------------------------------------------------------
  // Internal building blocks
  // ---------------------------------------------------------------------

  // Single oscillator voice with a gain envelope and optional pitch slide.
  // opts: { type, f0, f1, t (start offset), dur, gain, slide ("exp"|"lin") }
  function tone(opts) {
    const t0 = ctx.currentTime + (opts.t || 0);
    const dur = opts.dur || 0.1;
    const peak = opts.gain != null ? opts.gain : 0.5;

    const osc = ctx.createOscillator();
    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(safeFreq(opts.f0), t0);
    if (opts.f1 != null && opts.f1 !== opts.f0) {
      if (opts.slide === "lin") {
        osc.frequency.linearRampToValueAtTime(safeFreq(opts.f1), t0 + dur);
      } else {
        osc.frequency.exponentialRampToValueAtTime(safeFreq(opts.f1), t0 + dur);
      }
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return osc;
  }

  // White-noise burst through a swept lowpass filter.
  // opts: { dur, t, gain, filterF0, filterF1 }
  function noise(opts) {
    const t0 = ctx.currentTime + (opts.t || 0);
    const dur = Math.min(opts.dur || 0.2, 1.0);
    const peak = opts.gain != null ? opts.gain : 0.5;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(safeFreq(opts.filterF0 || 4000), t0);
    if (opts.filterF1 != null) {
      filter.frequency.exponentialRampToValueAtTime(
        safeFreq(opts.filterF1),
        t0 + dur
      );
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    return src;
  }

  // Play a note sequence. notes: array of [freq, beats] (freq 0 = rest).
  // tempo is in beats per second.
  function seq(notes, waveform, tempo, gain) {
    const beat = 1 / (tempo || 8);
    const vol = gain != null ? gain : 0.35;
    let t = 0;
    for (let i = 0; i < notes.length; i++) {
      const f = notes[i][0];
      const beats = notes[i][1] != null ? notes[i][1] : 1;
      const dur = beats * beat;
      if (f > 0) {
        tone({
          type: waveform || "square",
          f0: f,
          dur: Math.max(0.03, dur * 0.9),
          t: t,
          gain: vol,
        });
      }
      t += dur;
    }
  }

  // midi -> frequency helper for the note tables.
  function mf(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // Wrap a public effect so it can never throw and no-ops when not ready.
  function guarded(fn) {
    return function () {
      if (!ready()) return;
      try {
        fn.apply(null, arguments);
      } catch (e) {
        /* never throw from audio */
      }
    };
  }

  // ---------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------

  function tap() {
    tone({ type: "square", f0: 700, f1: 900, dur: 0.05, gain: 0.18 });
  }

  function plop() {
    // soft topping plop: quick sine drop + tiny noise tick
    tone({ type: "sine", f0: 420, f1: 180, dur: 0.09, gain: 0.4 });
    noise({ dur: 0.04, gain: 0.15, filterF0: 3000, filterF1: 800 });
  }

  function pluck() {
    // removing a topping: reverse of plop
    tone({ type: "sine", f0: 200, f1: 460, dur: 0.08, gain: 0.3 });
  }

  function whoosh() {
    // pizza slides into the oven
    noise({ dur: 0.25, gain: 0.4, filterF0: 600, filterF1: 3200 });
  }

  function pullOut() {
    noise({ dur: 0.2, gain: 0.35, filterF0: 3200, filterF1: 700 });
    tone({ type: "triangle", f0: 300, f1: 520, dur: 0.12, gain: 0.2 });
  }

  function ding() {
    // oven bell: bright sine with a fifth overtone
    tone({ type: "sine", f0: 1318.5, dur: 0.5, gain: 0.4 });
    tone({ type: "sine", f0: 1975.5, dur: 0.35, gain: 0.15 });
  }

  function cash() {
    // cha-ching: register click then two rising blips
    noise({ dur: 0.05, gain: 0.3, filterF0: 6000, filterF1: 2000 });
    tone({ type: "square", f0: 880, f1: 1175, dur: 0.07, t: 0.04, gain: 0.28 });
    tone({ type: "square", f0: 1318, f1: 1760, dur: 0.12, t: 0.12, gain: 0.28 });
  }

  function buzz() {
    tone({ type: "square", f0: 130, f1: 110, dur: 0.18, gain: 0.3 });
    tone({ type: "square", f0: 131, f1: 109, dur: 0.18, gain: 0.2 });
  }

  function angry() {
    // storming off: descending growl
    tone({ type: "sawtooth", f0: 300, f1: 90, dur: 0.5, gain: 0.3 });
    seq([[mf(64), 1], [mf(60), 1], [mf(55), 2]], "triangle", 7, 0.3);
  }

  function trash() {
    noise({ dur: 0.18, gain: 0.35, filterF0: 1800, filterF1: 300 });
    tone({ type: "triangle", f0: 240, f1: 80, dur: 0.15, gain: 0.25 });
  }

  function sizzle() {
    noise({ dur: 0.6, gain: 0.25, filterF0: 6000, filterF1: 3000 });
  }

  // ---------------------------------------------------------------------
  // Jingles (note tables use midi->freq helper mf())
  // ---------------------------------------------------------------------

  function dayIntro() {
    // bouncy tarantella-ish opener
    const tempo = 7;
    seq(
      [
        [mf(69), 1], // A4
        [mf(72), 1], // C5
        [mf(76), 1], // E5
        [mf(72), 1], // C5
        [mf(77), 1], // F5
        [mf(76), 1], // E5
        [mf(81), 2], // A5
      ],
      "square",
      tempo,
      0.28
    );
    seq(
      [
        [mf(45), 2], // A2
        [mf(52), 2], // E3
        [mf(50), 2], // D3
        [mf(45), 2], // A2
      ],
      "triangle",
      tempo,
      0.3
    );
  }

  function dayClear() {
    // rising fanfare: C5 E5 G5 C6 + sparkle
    seq(
      [
        [mf(72), 1],
        [mf(76), 1],
        [mf(79), 1],
        [mf(84), 2],
        [mf(88), 3],
      ],
      "square",
      9,
      0.3
    );
    tone({ type: "sine", f0: 2093, dur: 0.4, t: 0.5, gain: 0.12 });
  }

  function gameOver() {
    // slow descending minor phrase
    seq(
      [
        [mf(76), 1],
        [mf(72), 1],
        [mf(69), 1],
        [mf(64), 2],
      ],
      "triangle",
      2.5,
      0.35
    );
  }

  function coin() {
    // classic credit blip-bloop
    tone({ type: "square", f0: 660, f1: 990, dur: 0.07, gain: 0.3 });
    tone({ type: "square", f0: 990, f1: 1320, dur: 0.12, t: 0.08, gain: 0.3 });
  }

  function combo(n) {
    // quick rising arpeggio that climbs with the combo count (cap at 8)
    const step = Math.min(8, Math.max(1, Math.floor(n || 1)));
    const root = 71 + step; // up a semitone per combo level from B4
    tone({ type: "square", f0: mf(root), dur: 0.06, gain: 0.22 });
    tone({ type: "square", f0: mf(root + 4), dur: 0.06, t: 0.05, gain: 0.22 });
    tone({ type: "square", f0: mf(root + 7), dur: 0.09, t: 0.1, gain: 0.24 });
  }

  function vip() {
    // brief regal fanfare: G major lifting into C major (~0.5s)
    const lo = [67, 71, 74]; // G4 B4 D5
    const hi = [72, 76, 79, 84]; // C5 E5 G5 C6
    for (let i = 0; i < lo.length; i++) {
      tone({ type: "sawtooth", f0: mf(lo[i]), dur: 0.18, gain: 0.1 });
    }
    for (let i = 0; i < hi.length; i++) {
      tone({ type: "sawtooth", f0: mf(hi[i]), dur: 0.3, t: 0.2, gain: 0.09 });
    }
  }

  function heartGain() {
    // warm two-note chime: E5 then B5 on soft triangles + sine shimmer
    tone({ type: "triangle", f0: mf(76), dur: 0.25, gain: 0.3 });
    tone({ type: "triangle", f0: mf(83), dur: 0.35, t: 0.12, gain: 0.25 });
    tone({ type: "sine", f0: mf(88), dur: 0.3, t: 0.12, gain: 0.08 });
  }

  // ---------------------------------------------------------------------
  // Background music (looping tarantella chiptune, lookahead-scheduled)
  // ---------------------------------------------------------------------

  const MUSIC_GAIN = 0.5; // music bus level into master
  const MUSIC_BASE_EIGHTH = 60 / 152; // 152 BPM eighth-note feel
  const MUSIC_TICK_MS = 200; // scheduler poll interval

  let musicGain = null; // dedicated bus into master (so mute still works)
  let musicTimer = null; // setInterval id for the lookahead scheduler
  let musicDay = -1; // day the current loop was started for
  let musicNextBar = 0; // ctx time of the next unscheduled bar
  let musicBarIndex = 0; // running bar counter (pattern position)
  let musicEighth = 0; // current eighth-note duration in seconds

  // Tarantella in A: four bars of 6/8 eighth-note melody over a
  // dotted-quarter bass. Values are midi note numbers, 0 = rest.
  const MUSIC_MELODY = [
    [69, 73, 76, 81, 76, 73], // A major, up and back
    [69, 74, 78, 81, 78, 74], // D major (IV) bounce
    [69, 73, 76, 81, 76, 73], // A major again
    [68, 71, 76, 80, 76, 71], // E major (V) turnaround
  ];
  const MUSIC_BASS = [
    [45, 52], // A2 E3
    [50, 45], // D3 A2
    [45, 52], // A2 E3
    [40, 52], // E2 E3
  ];

  // Like tone() but with an absolute start time, routed to the music bus.
  function musicTone(when, type, freq, dur, gain) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(safeFreq(freq), when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // Tiny hi-hat tick: a short burst of highpassed noise on the music bus.
  function musicHat(when, gain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(7000, when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
    src.connect(filter);
    filter.connect(g);
    g.connect(musicGain);
    src.start(when);
    src.stop(when + 0.05);
  }

  // Schedule one full 6/8 bar (melody + bass + hats) starting at t0.
  function musicScheduleBar(t0) {
    const e = musicEighth;
    const mel = MUSIC_MELODY[musicBarIndex % MUSIC_MELODY.length];
    const bass = MUSIC_BASS[musicBarIndex % MUSIC_BASS.length];
    for (let i = 0; i < 6; i++) {
      if (mel[i] > 0) {
        musicTone(t0 + i * e, "square", mf(mel[i]), e * 0.85, 0.07);
      }
      // hat on every eighth, slightly accented on the two big beats
      musicHat(t0 + i * e, i % 3 === 0 ? 0.025 : 0.015);
    }
    musicTone(t0, "triangle", mf(bass[0]), e * 2.6, 0.09);
    musicTone(t0 + 3 * e, "triangle", mf(bass[1]), e * 2.6, 0.09);
    musicBarIndex++;
  }

  // Lookahead scheduler: keep one to two bars queued past the playhead.
  function musicTick() {
    try {
      if (!ready() || !musicGain) return;
      const barDur = 6 * musicEighth;
      while (musicNextBar < ctx.currentTime + barDur * 2) {
        musicScheduleBar(musicNextBar);
        musicNextBar += barDur;
      }
    } catch (e) {
      /* never throw from audio */
    }
  }

  function musicStart(day) {
    try {
      if (!ready()) return;
      const d = Math.max(1, Math.floor(day || 1));
      if (musicTimer != null && d === musicDay) return; // already playing
      musicStop();
      // tempo creeps up 2% per day after the first, capped at +20%
      const speed = 1 + Math.min(0.2, (d - 1) * 0.02);
      musicEighth = MUSIC_BASE_EIGHTH / speed;
      musicDay = d;
      musicBarIndex = 0;
      musicGain = ctx.createGain();
      musicGain.gain.setValueAtTime(MUSIC_GAIN, ctx.currentTime);
      musicGain.connect(master);
      musicNextBar = ctx.currentTime + 0.05;
      musicTick(); // fill the queue now, then keep it topped up
      musicTimer = setInterval(musicTick, MUSIC_TICK_MS);
    } catch (e) {
      musicDay = -1;
    }
  }

  function musicStop() {
    try {
      if (musicTimer != null) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
      musicDay = -1;
      if (musicGain && ctx) {
        const g = musicGain;
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.3); // quick fade out
        setTimeout(function () {
          try {
            g.disconnect();
          } catch (e) {
            /* already gone */
          }
        }, 350);
      }
      musicGain = null;
    } catch (e) {
      /* never throw from audio */
    }
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  const api = {
    unlock: function () {
      try {
        unlock();
      } catch (e) {
        /* never throw */
      }
    },
    setMuted: setMuted,
    tap: guarded(tap),
    plop: guarded(plop),
    pluck: guarded(pluck),
    whoosh: guarded(whoosh),
    pullOut: guarded(pullOut),
    ding: guarded(ding),
    cash: guarded(cash),
    buzz: guarded(buzz),
    angry: guarded(angry),
    trash: guarded(trash),
    sizzle: guarded(sizzle),
    dayIntro: guarded(dayIntro),
    dayClear: guarded(dayClear),
    gameOver: guarded(gameOver),
    coin: guarded(coin),
    combo: guarded(combo),
    vip: guarded(vip),
    heartGain: guarded(heartGain),
    // musicStart/musicStop manage their own state and guard internally.
    musicStart: musicStart,
    musicStop: musicStop,
  };

  Object.defineProperty(api, "muted", {
    get: function () {
      return isMuted;
    },
  });

  return api;
})();
