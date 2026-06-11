# Neon Slice

**[Play it live →](https://brycejmurrin.github.io/pizza/)**

An arcade pizzeria built with raw WebGL — no frameworks, no dependencies,
no build step. Runs in any modern browser on desktop or mobile. A sibling
of [Neon Swarm](https://github.com/brycejmurrin/project1): same engine
style, different kitchen.

Customers walk up to the counter with order tickets. Build each pizza from
the topping bins, slide it into the oven, pull it out in the golden window,
and serve the right customer before their patience bar runs out.

## How to play

**HOW TO PLAY** on the title screen (or in the pause menu) opens the full
in-game instructions.

### iOS / Touch
| Action | Gesture |
|--------|---------|
| Toggle a topping | Tap its bin |
| Load / pull the oven | Tap the oven |
| Serve a customer | Tap them |
| Inspect an order | Tap & hold the customer |
| Pause | Pause button (top-right) |

### Desktop / Keyboard
| Action | Key |
|--------|-----|
| Toggle toppings 1–9 | `1` `2` `3` `4` `5` `6` `7` `8` `9` |
| Load / pull the oven | `Space` |
| Trash the pizza | `X` |
| Serve customer 1–4 | `Q` `W` `E` `R` |
| Pause / unpause | `P` or `Esc` |
- Every order needs **sauce + cheese** plus extras from the ticket.
  Seven extras: pepperoni, mushroom, olive, pepper, anchovy, onion,
  jalapeño. The match must be exact — no surprise anchovies.
- The bake bar: gray = raw, green = good, **gold = perfect (+25 tip)**,
  amber = overdone (still servable), red = burnt. Raw and burnt pizzas
  get refused; trash them.
- Pay is 50 coins + up to 50 tip for speed + 25 for a perfect bake.
- A customer who walks out costs a heart; lose all hearts and you're
  closed. Clearing a day restores one heart (max 4) and pays a 100-coin
  bonus.
- **Combos:** consecutive successful serves multiply your tips (up to
  x2 at a 6 streak). A walkout breaks the streak.
- **VIPs:** from day 3, gold-clad customers with crowns pay double —
  but their patience drains 30% faster.
- **Rush customers:** from day 5, orange-bordered tickets — pay 1.5×
  base but patience drains at twice the normal rate.
- Days get busier: more simultaneous customers, more extras per order,
  thinner patience. High score is saved locally.
- Four upbeat chiptune tracks rotate daily — a tarantella, a mambo, a
  polka, and a driving minor groove — each speeding up slightly as the
  days go on. Toggle sound from the pause menu.

## Running it

Any static file server works:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from disk also works — there are no asset
fetches. Deploys to any static host (this repo auto-deploys to GitHub
Pages via the included workflow).

A headless smoke test (stubbed DOM + WebGL) plays through a full order
pipeline:

```sh
node test/smoke.js
```

## Project structure

```
index.html        Page shell, arcade HUD, overlay markup
css/style.css     Layout and neon pizzeria styling
js/renderer.js    Minimal batched WebGL renderer (triangles/quads/circles)
js/sprites.js     Vector sprites (pizzas, toppings, customers, oven, font)
js/audio.js       Synthesized Web Audio sound effects and jingles
js/game.js        State machine, orders, customers, baking, scoring
```

## How it works

- `renderer.js` batches all triangles/quads into one vertex buffer and draws
  the frame with a single `drawArrays` call, using premultiplied-alpha
  blending so overlapping brights bloom into a neon glow. Circles, rings,
  and arcs are tessellated into the same batch.
- `sprites.js` draws everything procedurally: pizzas tint from raw dough to
  golden to charcoal as they bake, toppings scatter at fixed per-type
  positions so identical orders look identical, and a tiny 3×5 pixel font
  renders in-canvas labels and floating score popups.
- `game.js` runs the shift: a day/quota state machine, walk-in customers
  with generated orders and patience timers, the prep → oven → ready →
  serve pipeline with a timing-window bake, hearts, tips, and per-day
  difficulty scaling.
- `audio.js` synthesizes every sound with the Web Audio API — topping
  plops, the oven ding, the register cha-ching, and the day jingles.
