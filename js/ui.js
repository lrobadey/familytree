/**
 * The inspector panel and toolbar. Reads the current selection from TreeView
 * and the data from Store, and renders contextual editing controls:
 *
 *   - rename / change gender of the selected person (live)
 *   - add a partner (new person, or link someone already in the tree)
 *   - add children to any of that person's partnerships
 *   - jump to related people (parents, children, partners)
 *   - delete a person
 *
 * Plus toolbar actions: add a standalone person, export/import JSON, clear.
 */

(function () {
  const Store = window.Store;
  const TreeView = window.TreeView;

  // Tiny DOM helper.
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function")
        n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return n;
  }

  const panel = document.getElementById("inspector");
  let pendingFocusName = false;

  // A reusable form to create-or-link a person.
  function personForm(submitLabel, excludeIds, onSubmit) {
    const nameInput = el("input", { type: "text", placeholder: "Name", class: "inp" });
    const genderSel = el("select", { class: "inp narrow" },
      el("option", { value: "f" }, "Female"),
      el("option", { value: "m" }, "Male"),
      el("option", { value: "x" }, "Other"));

    const candidates = Store.people().filter((p) => !excludeIds.includes(p.id));
    const existSel = el("select", { class: "inp" },
      el("option", { value: "" }, "— create new —"),
      ...candidates.map((p) => el("option", { value: p.id }, p.name)));

    // Linking an existing person makes the name/gender fields irrelevant.
    existSel.addEventListener("change", () => {
      const linking = !!existSel.value;
      nameInput.disabled = linking;
      genderSel.disabled = linking;
      nameInput.classList.toggle("disabled", linking);
    });

    const form = el("form", { class: "subform" },
      el("div", { class: "row" }, nameInput, genderSel),
      candidates.length ? existSel : null,
      el("button", { type: "submit", class: "btn primary full" }, submitLabel));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const existingId = existSel.value || null;
      const name = nameInput.value.trim();
      if (!existingId && !name) { nameInput.focus(); return; }
      onSubmit(existingId ? { existingId } : { name, gender: genderSel.value });
    });
    return form;
  }

  function personChip(id, extraClass = "") {
    const p = Store.getPerson(id);
    if (!p) return null;
    return el("button", {
      class: "chip " + (p.gender || "x") + " " + extraClass,
      onclick: () => { TreeView.select(id); TreeView.focus(id); },
    }, p.name);
  }

  function unionCard(union, personId) {
    const others = union.partners.filter((x) => x !== personId);
    const partnerChips = others.length
      ? el("div", { class: "chips" }, ...others.map((id) => personChip(id)))
      : el("span", { class: "muted small" }, "single parent");

    const excl = [...union.partners, ...(union.children || [])];

    return el("div", { class: "card" },
      el("div", { class: "card-head" },
        el("span", { class: "card-title" }, "Partnership"),
        partnerChips),
      (union.children || []).length
        ? el("div", { class: "chips wrap" },
            ...union.children.map((cid) => personChip(cid, "child")))
        : el("div", { class: "muted small" }, "no children yet"),
      el("details", { class: "adder" },
        el("summary", {}, "+ Add child"),
        personForm("Add child", excl, (opt) => {
          const id = Store.addChild(union.id, opt);
          if (id && !opt.existingId) { TreeView.select(id); TreeView.focus(id); }
        })));
  }

  function personEditor(person) {
    const id = person.id;

    const nameInput = el("input", { type: "text", value: person.name, class: "inp big" });
    nameInput.addEventListener("input", () => Store.updatePerson(id, { name: nameInput.value }));

    const genderSel = el("select", { class: "inp" },
      el("option", { value: "f" }, "Female"),
      el("option", { value: "m" }, "Male"),
      el("option", { value: "x" }, "Other"));
    genderSel.value = person.gender || "x";
    genderSel.addEventListener("change", () => Store.updatePerson(id, { gender: genderSel.value }));

    // Parents (if this person is a child in some union).
    const parentUnions = Store.parentUnionsOf(id);
    const parentBlock = parentUnions.length
      ? el("div", { class: "relations" },
          el("div", { class: "label" }, "Parents"),
          el("div", { class: "chips wrap" },
            ...parentUnions[0].partners.map((pid) => personChip(pid))))
      : null;

    const unions = Store.unionsForPerson(id);

    const body = el("div", { class: "inspector-body" },
      el("div", { class: "field" }, el("label", {}, "Name"), nameInput),
      el("div", { class: "field" }, el("label", {}, "Gender"), genderSel),
      parentBlock,
      el("h3", { class: "section-h" }, "Partnerships & children"),
      ...unions.map((u) => unionCard(u, id)),
      el("details", { class: "adder card ghost", open: unions.length ? null : "" },
        el("summary", {}, "+ Add partner"),
        personForm("Add partner", [id], (opt) => {
          const res = Store.addPartner(id, opt);
          if (res && !opt.existingId) { TreeView.select(res.personId); TreeView.focus(res.personId); }
        })),
      el("button", {
        class: "btn danger full",
        onclick: () => {
          if (confirm(`Delete ${person.name}? Their partnerships are removed too.`)) {
            TreeView.select(null);
            Store.deletePerson(id);
          }
        },
      }, "Delete person"));

    if (pendingFocusName) {
      pendingFocusName = false;
      setTimeout(() => { nameInput.focus(); nameInput.select(); }, 0);
    }
    return body;
  }

  function emptyState() {
    return el("div", { class: "inspector-empty" },
      el("p", {}, "Select a person to edit them, add a partner, or add children."),
      el("p", { class: "muted" },
        "Nothing selected. Use ", el("b", {}, "+ Add person"),
        " in the toolbar to start a new branch, then click it to build outward."));
  }

  function render() {
    const id = TreeView.getSelected();
    const person = id && Store.getPerson(id);
    panel.replaceChildren(person ? personEditor(person) : emptyState());
  }

  // React to selection and structural changes.
  TreeView.onSelectChange(render);
  Store.on("change", render);
  Store.on("update", () => {}); // in-place edits already reflected in canvas

  // ----- Toolbar -----------------------------------------------------------
  const q = (id) => document.getElementById(id);

  q("add-person").addEventListener("click", () => {
    pendingFocusName = true;
    const pid = Store.addPerson({ name: "New person", gender: "x" });
    TreeView.select(pid);
    TreeView.focus(pid);
  });

  q("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(Store.export(), null, 2)],
      { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "family-tree.json" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const fileInput = q("import-file");
  q("import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      Store.replaceAll(JSON.parse(await file.text()));
      TreeView.select(null);
    } catch (e) {
      alert("Could not import that file: " + e.message);
    }
    fileInput.value = "";
  });

  q("clear").addEventListener("click", () => {
    if (confirm("Clear the entire tree? This cannot be undone.")) {
      TreeView.select(null);
      Store.clearAll();
    }
  });

  render();
})();
