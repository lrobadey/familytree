/**
 * A small dependency-free force-directed physics engine.
 *
 * Everything is a Node with a position and velocity. Nodes are pushed apart
 * by a Coulomb-style repulsion and pulled together by Hookean springs (bonds).
 * A gentle gravity keeps the whole graph from drifting off screen.
 *
 * The engine is deliberately generic — it knows nothing about "families".
 * The family semantics live in main.js, which builds the right nodes/bonds.
 */

class Node {
  constructor(id, opts = {}) {
    this.id = id;
    this.x = opts.x ?? (Math.random() - 0.5) * 200;
    this.y = opts.y ?? (Math.random() - 0.5) * 200;
    this.vx = 0;
    this.vy = 0;
    this.mass = opts.mass ?? 1;
    this.radius = opts.radius ?? 26;      // used for rendering + repulsion falloff
    this.fixed = false;                    // true while being dragged
    this.data = opts.data ?? {};           // arbitrary payload (person, union, ...)
    this.kind = opts.kind ?? "node";       // "person" | "anchor" | ...
  }
}

class Bond {
  constructor(a, b, opts = {}) {
    this.a = a;                            // Node
    this.b = b;                            // Node
    this.length = opts.length ?? 120;      // rest length
    this.stiffness = opts.stiffness ?? 0.02;
    this.kind = opts.kind ?? "bond";       // "marriage" | "parent" | ...
    this.visible = opts.visible ?? true;
  }
}

class Simulation {
  constructor(opts = {}) {
    this.nodes = [];
    this.bonds = [];
    this.byId = new Map();

    // Tunables (see index for how these shape the layout).
    this.repulsion = opts.repulsion ?? 12000;
    this.gravity = opts.gravity ?? 0.0009;
    this.damping = opts.damping ?? 0.86;
    this.center = opts.center ?? { x: 0, y: 0 };
    this.maxVelocity = opts.maxVelocity ?? 30;
  }

  addNode(node) {
    this.nodes.push(node);
    this.byId.set(node.id, node);
    return node;
  }

  addBond(bond) {
    this.bonds.push(bond);
    return bond;
  }

  get(id) {
    return this.byId.get(id);
  }

  /** Advance the simulation by one step. dt is a normalized factor (~1). */
  step(dt = 1) {
    const n = this.nodes;

    // Pairwise repulsion — O(n^2), fine for family-sized graphs.
    for (let i = 0; i < n.length; i++) {
      const a = n[i];
      for (let j = i + 1; j < n.length; j++) {
        const b = n[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          // Coincident nodes: nudge apart deterministically-ish.
          dx = (Math.random() - 0.5);
          dy = (Math.random() - 0.5);
          d2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(d2);
        const force = this.repulsion / d2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += (fx / a.mass) * dt;
        a.vy += (fy / a.mass) * dt;
        b.vx -= (fx / b.mass) * dt;
        b.vy -= (fy / b.mass) * dt;
      }
    }

    // Spring bonds (Hooke's law).
    for (const bond of this.bonds) {
      const a = bond.a;
      const b = bond.b;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const displacement = dist - bond.length;
      const force = displacement * bond.stiffness;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += (fx / a.mass) * dt;
      a.vy += (fy / a.mass) * dt;
      b.vx -= (fx / b.mass) * dt;
      b.vy -= (fy / b.mass) * dt;
    }

    // Gravity toward the center + integrate + damp.
    for (const node of this.nodes) {
      if (node.fixed) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx += (this.center.x - node.x) * this.gravity * dt;
      node.vy += (this.center.y - node.y) * this.gravity * dt;

      node.vx *= this.damping;
      node.vy *= this.damping;

      // Clamp runaway velocities for stability.
      const speed = Math.hypot(node.vx, node.vy);
      if (speed > this.maxVelocity) {
        node.vx = (node.vx / speed) * this.maxVelocity;
        node.vy = (node.vy / speed) * this.maxVelocity;
      }

      node.x += node.vx * dt;
      node.y += node.vy * dt;
    }
  }

  /** Total kinetic energy — useful to know when the layout has settled. */
  energy() {
    let e = 0;
    for (const node of this.nodes) {
      e += 0.5 * node.mass * (node.vx * node.vx + node.vy * node.vy);
    }
    return e;
  }
}

window.Physics = { Node, Bond, Simulation };
