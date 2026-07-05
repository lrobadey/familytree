/**
 * Wires the family data into the physics engine, renders the graph on a
 * canvas, and handles interaction (drag, pan, zoom, hover).
 */

(function () {
  const { Node, Bond, Simulation } = window.Physics;
  const DATA = window.FAMILY_DATA;

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");

  // ----- View transform (pan + zoom over world coordinates) ----------------
  const view = { x: 0, y: 0, scale: 1 };

  // ----- Build the simulation from the data --------------------------------
  const sim = new Simulation({ repulsion: 16000, gravity: 0.0012, damping: 0.85 });

  const personById = new Map(DATA.people.map((p) => [p.id, p]));

  // Person nodes.
  for (const p of DATA.people) {
    sim.addNode(new Node(p.id, { kind: "person", radius: 30, data: p }));
  }

  // Each union gets an invisible anchor node between the partners; children
  // hang off that anchor. This is the "family system" made physical.
  for (const u of DATA.unions) {
    const anchor = sim.addNode(
      new Node(u.id, { kind: "anchor", radius: 6, mass: 0.6, data: u })
    );

    // Marriage bonds: each partner to the anchor (keeps the couple close and
    // symmetric around their shared anchor).
    for (const partnerId of u.partners) {
      sim.addBond(
        new Bond(sim.get(partnerId), anchor, {
          kind: "marriage",
          length: 70,
          stiffness: 0.05,
          visible: false,
        })
      );
    }

    // Parent → child bonds run from the anchor to each child.
    for (const childId of u.children || []) {
      sim.addBond(
        new Bond(anchor, sim.get(childId), {
          kind: "parent",
          length: 150,
          stiffness: 0.025,
        })
      );
    }
  }

  // Give the initial layout a hint so it unfolds instead of exploding:
  // partners left/right of their anchor, children fanned out below.
  layoutSeed();
  function layoutSeed() {
    for (const u of DATA.unions) {
      const anchor = sim.get(u.id);
      const [a, b] = u.partners.map((id) => sim.get(id));
      if (a) { a.x = anchor.x - 90; a.y = anchor.y - 40; }
      if (b) { b.x = anchor.x + 90; b.y = anchor.y - 40; }
      (u.children || []).forEach((id, i, arr) => {
        const child = sim.get(id);
        const spread = (i - (arr.length - 1) / 2) * 120;
        child.x = anchor.x + spread;
        child.y = anchor.y + 170;
      });
    }
  }

  // ----- Rendering ---------------------------------------------------------
  const COLORS = {
    m: { fill: "#3b82f6", glow: "rgba(59,130,246,0.35)" },
    f: { fill: "#ec4899", glow: "rgba(236,72,153,0.35)" },
    default: { fill: "#8b5cf6", glow: "rgba(139,92,246,0.35)" },
  };

  let hovered = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sim.center = { x: 0, y: 0 };
  }
  window.addEventListener("resize", resize);

  function worldToScreen(wx, wy) {
    return {
      x: (wx + view.x) * view.scale + canvas.clientWidth / 2,
      y: (wy + view.y) * view.scale + canvas.clientHeight / 2,
    };
  }
  function screenToWorld(sx, sy) {
    return {
      x: (sx - canvas.clientWidth / 2) / view.scale - view.x,
      y: (sy - canvas.clientHeight / 2) / view.scale - view.y,
    };
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // Bonds.
    for (const bond of sim.bonds) {
      if (!bond.visible) continue;
      const a = worldToScreen(bond.a.x, bond.a.y);
      const b = worldToScreen(bond.b.x, bond.b.y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle =
        bond.kind === "parent" ? "rgba(148,163,184,0.35)" : "rgba(226,232,240,0.5)";
      ctx.lineWidth = (bond.kind === "parent" ? 1.5 : 2) * view.scale;
      ctx.stroke();
    }

    // Marriage links: draw a soft line directly between partners (through the
    // hidden anchor) so couples read as a pair.
    for (const u of DATA.unions) {
      const [a, b] = u.partners.map((id) => sim.get(id));
      if (!a || !b) continue;
      const pa = worldToScreen(a.x, a.y);
      const pb = worldToScreen(b.x, b.y);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = "rgba(251,191,36,0.6)";
      ctx.lineWidth = 3 * view.scale;
      ctx.stroke();
    }

    // Person nodes.
    for (const node of sim.nodes) {
      if (node.kind !== "person") continue;
      const p = worldToScreen(node.x, node.y);
      const r = node.radius * view.scale;
      const c = COLORS[node.data.gender] || COLORS.default;
      const isHover = hovered === node;

      // Glow.
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (isHover ? 1.5 : 1.25), 0, Math.PI * 2);
      ctx.fillStyle = c.glow;
      ctx.fill();

      // Body.
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.lineWidth = 2 * view.scale;
      ctx.strokeStyle = isHover ? "#fff" : "rgba(255,255,255,0.6)";
      ctx.stroke();

      // Label.
      ctx.fillStyle = "#e2e8f0";
      ctx.font = `${Math.max(11, 13 * view.scale)}px "Inter", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(node.data.name, p.x, p.y + r + 6);
    }
  }

  // ----- Main loop ---------------------------------------------------------
  function tick() {
    for (let i = 0; i < 2; i++) sim.step(1); // a couple of substeps per frame
    draw();
    requestAnimationFrame(tick);
  }

  // ----- Interaction -------------------------------------------------------
  let dragging = null;
  let panning = false;
  let last = { x: 0, y: 0 };

  function nodeAt(sx, sy) {
    const w = screenToWorld(sx, sy);
    for (let i = sim.nodes.length - 1; i >= 0; i--) {
      const node = sim.nodes[i];
      if (node.kind !== "person") continue;
      if (Math.hypot(node.x - w.x, node.y - w.y) <= node.radius) return node;
    }
    return null;
  }

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const node = nodeAt(sx, sy);
    if (node) {
      dragging = node;
      node.fixed = true;
    } else {
      panning = true;
    }
    last = { x: sx, y: sy };
  });

  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragging) {
      const w = screenToWorld(sx, sy);
      dragging.x = w.x;
      dragging.y = w.y;
    } else if (panning) {
      view.x += (sx - last.x) / view.scale;
      view.y += (sy - last.y) / view.scale;
    } else {
      hovered = nodeAt(sx, sy);
      canvas.style.cursor = hovered ? "grab" : "default";
    }
    last = { x: sx, y: sy };
  });

  window.addEventListener("mouseup", () => {
    if (dragging) dragging.fixed = false;
    dragging = null;
    panning = false;
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    view.scale = Math.min(3, Math.max(0.3, view.scale * factor));
  }, { passive: false });

  // Fit / reset button.
  const resetBtn = document.getElementById("reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      view.x = 0;
      view.y = 0;
      view.scale = 1;
      layoutSeed();
    });
  }

  // ----- Go ----------------------------------------------------------------
  resize();
  tick();
})();
