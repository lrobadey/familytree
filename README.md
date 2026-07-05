# Family Tree

A physics-based family tree. People are nodes in a force-directed simulation;
families are self-contained physics **systems** that nest naturally as the tree
grows. No build step, no dependencies — open `index.html` and it runs.

## Run it

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

- **Drag** a person to reposition them (the rest of the family reacts).
- **Scroll** to zoom, **drag the background** to pan.
- **Reset view** re-centers and re-seeds the layout.

## How it works

Three files, three ideas:

| File             | Responsibility                                                        |
| ---------------- | --------------------------------------------------------------------- |
| `js/physics.js`  | Generic force-directed engine: `Node`, `Bond`, `Simulation`. Knows nothing about families. |
| `js/data.js`     | The family data — `people` and `unions`.                              |
| `js/main.js`     | Turns data into nodes/bonds, renders to canvas, handles interaction.  |

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

## Growing the tree

Edit `js/data.js`. Add people to `people`, then describe relationships in
`unions`. To attach a new generation, give a child their own union:

```js
people: [
  // ...existing people
  { id: "partner_of_luca", name: "…", gender: "f" },
  { id: "grandchild",      name: "…", gender: "m" },
],
unions: [
  // ...existing union
  {
    id: "u_luca",
    partners: ["luca", "partner_of_luca"],
    children: ["grandchild"],
  },
],
```

No other changes needed — the engine picks up the new nodes and the nested
system falls out of the physics.
