/**
 * Family data model.
 *
 * The tree is described by three primitives that map directly onto the
 * physics engine's node/bond concepts:
 *
 *   people  – individual persons (become physics nodes)
 *   unions  – a partnership between two people. A union owns an invisible
 *             anchor node that sits between the partners; children attach to
 *             that anchor. This is what makes a "family" a self-contained
 *             physics *system*: partners + anchor + children behave as a
 *             cluster, and because a child can themselves head a union, the
 *             systems nest naturally.
 *   (children are expressed inline on each union)
 *
 * To grow the tree, add people and unions below. Nothing else needs to change.
 */

const FAMILY_DATA = {
  people: [
    { id: "melanie",  name: "Melanie Janin",       gender: "f" },
    { id: "jeanlouis", name: "Jean-Louis Robadey", gender: "m" },
    { id: "luca",      name: "Luca",     gender: "m" },
    { id: "alicia",    name: "Alicia",   gender: "f" },
    { id: "juliette",  name: "Juliette", gender: "f" },
  ],

  unions: [
    {
      id: "u_robadey_janin",
      partners: ["melanie", "jeanlouis"],
      children: ["luca", "alicia", "juliette"],
      // Optional label shown for the family system as a whole.
      label: "Robadey · Janin",
    },
  ],
};

// Expose for the non-module scripts that follow.
window.FAMILY_DATA = FAMILY_DATA;
