# Family Tree

A physics-based family tree. People are nodes in a force-directed simulation;
families are self-contained physics **systems** that nest naturally as the tree
grows. No build step, no dependencies — open `index.html` and it runs.

## Run it

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

- **Click** a person to select them — the inspector panel opens on the right.
- **Drag** a person to reposition them (the rest of the family reacts).
- **Scroll** to zoom, **drag the background** to pan, click empty space to deselect.
- **Reset view** re-centers the camera.

### Building the tree in the browser

Everything is editable live — no code required. Select a person and the
inspector lets you:

- **Rename** them and set their gender (updates instantly).
- **Add a partner** — either create a new person or link someone already in the
  tree (so cousins, remarriages, and other cross-links are possible).
- **Add children** to any of their partnerships (again, new or existing person).
- **Jump** to parents, partners, and children via the clickable chips.
- **Delete** a person (their partnerships are cleaned up automatically).

Because any child can be given their own partner and children, families nest
indefinitely — that's how you grow a fully interconnected tree.

Your tree is saved to the browser automatically (`localStorage`). Use
**Export** to download it as JSON for backup or sharing, **Import** to load one
back, and **Clear** to start over.

## How it works

A few small files, each with one job:

| File             | Responsibility                                                                 |
| ---------------- | ------------------------------------------------------------------------------ |
| `js/physics.js`  | Generic force-directed engine: `Node`, `Bond`, `Simulation`. Knows nothing about families. |
| `js/data.js`     | The **seed** family data — used only on first run.                             |
| `js/store.js`    | The live data + CRUD + `localStorage` persistence. Emits events on change.     |
| `js/main.js`     | Builds the simulation from the store, renders to canvas, handles interaction + selection. Rebuilds on change, preserving positions. |
| `js/ui.js`       | The inspector panel and toolbar — reads the store, drives the CRUD operations. |

### The "nested systems" model

A **union** (partnership) owns an invisible *anchor* node sitting between the
partners. Partners spring toward the anchor; children spring off it. That makes
each family a bounded cluster — a system. Because any child can themselves head
a union, those systems nest without any special-casing: the same physics that
holds one family together holds a family-of-families together.

Forces at play:

- **Repulsion** pushes every person apart (keeps nodes from overlapping).
- **Marriage springs** hold partners close around their shared anchor.
- **Parent → child springs** pull children toward the union anchor.
- **Gravity** gently keeps the whole graph centered.

## Data model

Both the seed file and the persisted store use the same shape:

```js
people: [ { id, name, gender } ]              // gender: "m" | "f" | "x"
unions: [ { id, partners: [id, id], children: [id, ...] } ]
```

A `union` is a partnership; `partners` are the couple and `children` are their
kids. That's the whole model — the physics, the connectors, and the nested
family systems all fall out of it.

> The tree lives in your browser's `localStorage` once you start editing, so
> changing `js/data.js` afterwards has no effect unless you **Clear** the tree
> (or import a fresh JSON). `data.js` is just the first-run seed.

### Changing the seed

To ship a different starting tree, edit `people` and `unions` in `js/data.js`
and clear your browser storage for the page. To attach a new generation, give a
child their own union (partner + children) — the same nesting the UI produces.
