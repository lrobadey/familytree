/**
 * The canvas view: builds the physics simulation from the Store, renders it,
 * and handles interaction (drag, pan, zoom, select). It rebuilds whenever the
 * Store emits a structural 'change', preserving the positions of nodes that
 * still exist so the layout doesn't jump around while you edit.
 *
 * Selection is view state, exposed on window.TreeView so the inspector can
 * read/drive it.
 */

(function () {
  const { Node, Bond, Simulation } = window.Physics;
  const Store = window.Store;

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");

  // ----- Camera (pan + zoom, with easing toward a target when focusing) ----
  const view = { x: 0, y: 0, scale: 1, tx: 0, ty: 0, easing: false };

  // ----- Selection ---------------------------------------------------------
  let selectedId = null;
  const selectListeners = [];
  function setSelected(id) {
    selectedId = id;
    selectListeners.forEach((cb) => cb(id));
  }

  window.TreeView = {
    getSelected: () => selectedId,
    select: (id) => setSelected(id),
    onSelectChange: (cb) => selectListeners.push(cb),
    focus: (id) => {
      const n = sim && sim.get(id);
      if (!n) return;
      view.tx = -n.x;
      view.ty = -n.y;
      view.easing = true;
    },
  };

  // ----- Build / rebuild the simulation from the Store ---------------------
  let sim = null;

  function buildSim() {
    const s = new Simulation({ repulsion: 16000, gravity: 0.0012, damping: 0.85 });

    for (const p of Store.people()) {
      s.addNode(new Node(p.id, { kind: "person", radius: 30, data: p }));
    }

    for (const u of Store.unions()) {
      const anchor = s.addNode(
        new Node(u.id, { kind: "anchor", radius: 6, mass: 0.6, data: u })
      );
      for (const partnerId of u.partners) {
        const partner = s.get(partnerId);
        if (partner) {
          s.addBond(new Bond(partner, anchor, {
            kind: "marriage", length: 70, stiffness: 0.05, visible: false }));
        }
      }
      for (const childId of u.children || []) {
        const child = s.get(childId);
        if (child) {
          s.addBond(new Bond(anchor, child, {
            kind: "parent", length: 150, stiffness: 0.025, visible: false }));
        }
      }
    }
    return s;
  }

  function rebuild() {
    // Snapshot current positions so surviving nodes stay put.
    const prev = new Map();
    if (sim) for (const n of sim.nodes) prev.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });

    dragging = null; // any stale drag target is gone after a rebuild
    sim = buildSim();

    for (const n of sim.nodes) {
      const p = prev.get(n.id);
      if (p) {
        n.x = p.x; n.y = p.y; n.vx = p.vx; n.vy = p.vy;
      } else {
        n._needsSeed = true;
      }
    }
    seedNewNodes();

    // Drop a selection whose person no longer exists.
    if (selectedId && !Store.getPerson(selectedId)) setSelected(null);
  }

  /** Give brand-new nodes a sensible starting position based on their role. */
  function seedNewNodes() {
    for (const u of Store.unions()) {
      const anchor = sim.get(u.id);
      const partners = u.partners.map((id) => sim.get(id)).filter(Boolean);
      const known = partners.find((p) => !p._needsSeed);

      if (anchor && anchor._needsSeed) {
        const base = known || { x: (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 200 };
        anchor.x = base.x + (known ? 0 : 0);
        anchor.y = base.y + 30;
        anchor._needsSeed = false;
      }
      partners.forEach((p, i) => {
        if (p._needsSeed) {
          p.x = anchor.x + (i === 0 ? -100 : 100);
          p.y = anchor.y - 30;
          p._needsSeed = false;
        }
      });
      const kids = (u.children || []).map((id) => sim.get(id)).filter(Boolean);
      kids.forEach((k, i, arr) => {
        if (k._needsSeed) {
          const spread = (i - (arr.length - 1) / 2) * 120;
          k.x = anchor.x + spread + (Math.random() - 0.5) * 20;
          k.y = anchor.y + 170;
          k._needsSeed = false;
        }
      });
    }
    // Any leftover unconnected people.
    for (const n of sim.nodes) {
      if (n._needsSeed) {
        n.x = (Math.random() - 0.5) * 150;
        n.y = (Math.random() - 0.5) * 150;
        n._needsSeed = false;
      }
    }
  }

  Store.on("change", rebuild);

  // ----- Rendering ---------------------------------------------------------
  const COLORS = {
    m: { fill: "#3b82f6", glow: "rgba(59,130,246,0.35)" },
    f: { fill: "#ec4899", glow: "rgba(236,72,153,0.35)" },
    x: { fill: "#8b5cf6", glow: "rgba(139,92,246,0.35)" },
  };
  const colorFor = (g) => COLORS[g] || COLORS.x;

  let hovered = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  const worldToScreen = (wx, wy) => ({
    x: (wx + view.x) * view.scale + canvas.clientWidth / 2,
    y: (wy + view.y) * view.scale + canvas.clientHeight / 2,
  });
  const screenToWorld = (sx, sy) => ({
    x: (sx - canvas.clientWidth / 2) / view.scale - view.x,
    y: (sy - canvas.clientHeight / 2) / view.scale - view.y,
  });

  function draw() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // Family connectors: partnership line + a stem/branch down to children.
    for (const u of Store.unions()) {
      const partners = u.partners.map((id) => sim.get(id)).filter(Boolean);
      if (!partners.length) continue;

      // Origin of this family system: midpoint of the couple (or the single
      // parent's position).
      const origin =
        partners.length >= 2
          ? { x: (partners[0].x + partners[1].x) / 2, y: (partners[0].y + partners[1].y) / 2 }
          : { x: partners[0].x, y: partners[0].y };

      const kids = (u.children || []).map((id) => sim.get(id)).filter(Boolean);
      if (kids.length) {
        const avg = kids.reduce(
          (a, k) => ({ x: a.x + k.x / kids.length, y: a.y + k.y / kids.length }),
          { x: 0, y: 0 }
        );
        const dx = avg.x - origin.x;
        const dy = avg.y - origin.y;
        const len = Math.hypot(dx, dy) || 1;
        const junction = { x: origin.x + (dx / len) * 28, y: origin.y + (dy / len) * 28 };

        const o = worldToScreen(origin.x, origin.y);
        const j = worldToScreen(junction.x, junction.y);
        ctx.strokeStyle = "rgba(148,163,184,0.5)";
        ctx.lineWidth = 1.8 * view.scale;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(j.x, j.y); ctx.stroke();
        for (const k of kids) {
          const ks = worldToScreen(k.x, k.y);
          ctx.beginPath(); ctx.moveTo(j.x, j.y); ctx.lineTo(ks.x, ks.y); ctx.stroke();
        }
      }

      // Partnership line (only meaningful for a couple).
      if (partners.length >= 2) {
        const pa = worldToScreen(partners[0].x, partners[0].y);
        const pb = worldToScreen(partners[1].x, partners[1].y);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = "rgba(251,191,36,0.7)";
        ctx.lineWidth = 3 * view.scale;
        ctx.stroke();
      }
    }

    // Person nodes.
    for (const node of sim.nodes) {
      if (node.kind !== "person") continue;
      const p = worldToScreen(node.x, node.y);
      const r = node.radius * view.scale;
      const c = colorFor(node.data.gender);
      const isHover = hovered === node;
      const isSel = selectedId === node.id;

      // Selection ring.
      if (isSel) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 7 * view.scale, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2.5 * view.scale;
        ctx.setLineDash([6 * view.scale, 4 * view.scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (isHover || isSel ? 1.45 : 1.25), 0, Math.PI * 2);
      ctx.fillStyle = c.glow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.lineWidth = 2 * view.scale;
      ctx.strokeStyle = isHover || isSel ? "#fff" : "rgba(255,255,255,0.6)";
      ctx.stroke();

      ctx.fillStyle = "#e2e8f0";
      ctx.font = `${Math.max(11, 13 * view.scale)}px "Inter", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(node.data.name, p.x, p.y + r + 6);
    }
  }

  // ----- Main loop ---------------------------------------------------------
  function tick() {
    for (let i = 0; i < 2; i++) sim.step(1);
    if (view.easing) {
      view.x += (view.tx - view.x) * 0.15;
      view.y += (view.ty - view.y) * 0.15;
      if (Math.hypot(view.tx - view.x, view.ty - view.y) < 0.5) {
        view.x = view.tx; view.y = view.ty; view.easing = false;
      }
    }
    draw();
    requestAnimationFrame(tick);
  }

  // ----- Interaction -------------------------------------------------------
  let dragging = null;
  let panning = false;
  let last = { x: 0, y: 0 };
  let downAt = { x: 0, y: 0 };
  let moved = 0;

  function nodeAt(sx, sy) {
    const w = screenToWorld(sx, sy);
    for (let i = sim.nodes.length - 1; i >= 0; i--) {
      const node = sim.nodes[i];
      if (node.kind !== "person") continue;
      if (Math.hypot(node.x - w.x, node.y - w.y) <= node.radius) return node;
    }
    return null;
  }

  const localXY = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener("mousedown", (e) => {
    const { x: sx, y: sy } = localXY(e);
    downAt = { x: sx, y: sy };
    moved = 0;
    const node = nodeAt(sx, sy);
    if (node) {
      dragging = node;
      node.fixed = true;
      setSelected(node.id);
    } else {
      panning = true;
    }
    last = { x: sx, y: sy };
  });

  window.addEventListener("mousemove", (e) => {
    const { x: sx, y: sy } = localXY(e);
    moved += Math.hypot(sx - last.x, sy - last.y);
    if (dragging) {
      const w = screenToWorld(sx, sy);
      dragging.x = w.x; dragging.y = w.y;
    } else if (panning) {
      view.x += (sx - last.x) / view.scale;
      view.y += (sy - last.y) / view.scale;
      view.tx = view.x; view.ty = view.y; view.easing = false;
    } else {
      hovered = nodeAt(sx, sy);
      canvas.style.cursor = hovered ? "grab" : "default";
    }
    last = { x: sx, y: sy };
  });

  window.addEventListener("mouseup", () => {
    if (dragging) dragging.fixed = false;
    // A click on empty space (no meaningful drag) clears the selection.
    if (panning && moved < 4) setSelected(null);
    dragging = null;
    panning = false;
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    view.scale = Math.min(3, Math.max(0.3, view.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
  }, { passive: false });

  // ----- Toolbar wiring owned by the view ----------------------------------
  const resetBtn = document.getElementById("reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      view.scale = 1;
      view.tx = 0; view.ty = 0; view.easing = true;
    });
  }

  // ----- Go ----------------------------------------------------------------
  resize();
  rebuild();
  tick();
})();
