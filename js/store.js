/**
 * The single source of truth for the tree's data.
 *
 * Holds `people` and `unions` (same shape as js/data.js), persists to
 * localStorage, and exposes CRUD operations. Every mutation saves and emits an
 * event so the view and the inspector can react:
 *
 *   'change' – structural change (add/delete/link). Listeners rebuild.
 *   'update' – in-place edit (rename / gender). Cheap; no rebuild needed.
 *
 * The primitives here are enough to build an arbitrarily interconnected tree:
 * add a person, partner two people, add children to a partnership, add a
 * partner to any of those children, and so on.
 */

(function () {
  const KEY = "familytree.v1";
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = (prefix) => prefix + "_" + Math.random().toString(36).slice(2, 9);

  const listeners = {};
  const on = (evt, cb) => ((listeners[evt] ||= []).push(cb), cb);
  const emit = (evt, payload) => (listeners[evt] || []).forEach((cb) => cb(payload));

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Family tree: could not load saved data", e);
    }
    // First run: seed from the bundled family data.
    const seed = window.FAMILY_DATA || { people: [], unions: [] };
    return clone({ people: seed.people, unions: seed.unions });
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Family tree: could not save data", e);
    }
  }

  // ----- Getters -----------------------------------------------------------
  const people = () => state.people;
  const unions = () => state.unions;
  const getPerson = (id) => state.people.find((p) => p.id === id);
  const getUnion = (id) => state.unions.find((u) => u.id === id);
  const unionsForPerson = (id) => state.unions.filter((u) => u.partners.includes(id));
  const parentUnionsOf = (id) =>
    state.unions.filter((u) => (u.children || []).includes(id));

  // ----- Mutations ---------------------------------------------------------
  function makePerson(opt) {
    const person = { id: uid("p"), name: (opt.name || "").trim() || "New person",
                     gender: opt.gender || "x" };
    state.people.push(person);
    return person.id;
  }

  function addPerson(opt = {}) {
    const id = makePerson(opt);
    save();
    emit("change", { type: "addPerson", id });
    return id;
  }

  function updatePerson(id, patch) {
    const p = getPerson(id);
    if (!p) return;
    Object.assign(p, patch); // mutate in place so the live node.data updates
    save();
    emit("update", { id });
  }

  function deletePerson(id) {
    state.people = state.people.filter((p) => p.id !== id);
    for (const u of state.unions) {
      u.partners = u.partners.filter((x) => x !== id);
      if (u.children) u.children = u.children.filter((x) => x !== id);
    }
    // Drop partnerships that lost all their partners.
    state.unions = state.unions.filter((u) => u.partners.length > 0);
    save();
    emit("change", { type: "deletePerson", id });
  }

  /**
   * Add a partner to `personId`. Pass { existingId } to link someone already in
   * the tree, or { name, gender } to create a new person. Returns the new
   * union id and the partner's id.
   */
  function addPartner(personId, opt = {}) {
    const partnerId = opt.existingId || makePerson(opt);
    const id = uid("u");
    state.unions.push({ id, partners: [personId, partnerId], children: [] });
    save();
    emit("change", { type: "addPartner", unionId: id, personId: partnerId });
    return { unionId: id, personId: partnerId };
  }

  /**
   * Add a child to a partnership. Pass { existingId } to attach an existing
   * person, or { name, gender } to create one. Returns the child's id.
   */
  function addChild(unionId, opt = {}) {
    const u = getUnion(unionId);
    if (!u) return null;
    const childId = opt.existingId || makePerson(opt);
    (u.children ||= []).push(childId);
    save();
    emit("change", { type: "addChild", unionId, childId });
    return childId;
  }

  function replaceAll(data) {
    if (!data || !Array.isArray(data.people) || !Array.isArray(data.unions)) {
      throw new Error("Invalid family tree file");
    }
    state = { people: clone(data.people), unions: clone(data.unions) };
    save();
    emit("change", { type: "replace" });
  }

  function clearAll() {
    state = { people: [], unions: [] };
    save();
    emit("change", { type: "clear" });
  }

  window.Store = {
    on,
    people, unions, getPerson, getUnion, unionsForPerson, parentUnionsOf,
    addPerson, updatePerson, deletePerson, addPartner, addChild,
    replaceAll, clearAll, save,
    export: () => clone(state),
  };
})();
