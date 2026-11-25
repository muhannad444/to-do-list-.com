(function () {
  "use strict";

  const STORAGE_KEY = "codex-notebook-data-v3";
  const LEGACY_STORAGE_KEY = "apple-notes-clone-data-v2";

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const nowISO = () => new Date().toISOString();

  let state = {
    theme: "light",
    folders: [],
    notes: [],
    activeFolderId: "all",
    activeNoteId: null,
    activeTagFilter: null,
    searchQuery: "",
    searchScope: "all",
    sortBy: "updated",
    splitMode: false,
    referenceNoteId: null,
    typography: { font: "sans", size: "medium", measure: "folio" }
  };

  let selectMode = false;
  let selectedNoteIds = new Set();

  const StorageAdapter = {
    async get(key) {
      try {
        if (window.storage && typeof window.storage.get === "function") {
          const res = await window.storage.get(key, false);
          if (res && res.value) return res.value;
        }
      } catch (e) {}
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },
    async set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (e) {
        showToast("Storage limit reached — export a Vault backup.");
      }
      try {
        if (window.storage && typeof window.storage.set === "function") {
          await window.storage.set(key, value, false);
        }
      } catch (e) {}
    }
  };

  function defaultFolders() {
    return [
      { id: "notes", name: "General Notes", emoji: "📜", system: true },
      { id: uid(), name: "Atelier & Projects", emoji: "📐", system: false },
      { id: uid(), name: "Reading & Ideas", emoji: "🪶", system: false },
      { id: uid(), name: "Personal Journal", emoji: "🌿", system: false }
    ];
  }

  function defaultNotes(folders) {
    const generalF = (folders[0] && folders[0].id) || "notes";
    const atelierF = (folders[1] && folders[1].id) || generalF;
    const ideasF = (folders[2] && folders[2].id) || generalF;

    const noteGeometry = {
      id: uid(),
      folderId: ideasF,
      pinned: false,
      deleted: false,
      tags: ["geometry", "design"],
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      html: `<h1 class="note-title-line">Proportions & Spatial Harmony</h1>
      <div>Notes on applying the Golden Ratio (1 : 1.618) and Vitruvian symmetry to modern interfaces and everyday workspace layouts.</div>
      <div><br></div>
      <blockquote class="folio-quote">“Simplicity is the ultimate sophistication — clarity emerges when every proportion serves human thought.”</blockquote>
      <div><br></div>
      <ul><li>Maintain generous breathing room around the primary reading column (65–72 characters).</li><li>Use subtle hairline rules rather than heavy boxes to separate ideas.</li></ul>`
    };

    const noteChecklist = {
      id: uid(),
      folderId: atelierF,
      pinned: false,
      deleted: false,
      tags: ["workflow", "checklist"],
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      html: `<h1 class="note-title-line">Weekly Studio Checklist</h1>
      <ul class="checklist">
        <li class="checked"><span class="chk"></span><span class="chk-text" contenteditable="true">Review active project sketches and diagrams</span></li>
        <li><span class="chk"></span><span class="chk-text" contenteditable="true">Synthesize reading notes into permanent entries</span></li>
        <li><span class="chk"></span><span class="chk-text" contenteditable="true">Export weekly Vault backup (.json)</span></li>
      </ul>`
    };

    const welcomeNote = {
      id: uid(),
      folderId: generalF,
      pinned: true,
      deleted: false,
      tags: ["welcome", "index"],
      createdAt: nowISO(),
      updatedAt: nowISO(),
      html: `<h1 class="note-title-line">Welcome to Codex</h1>
      <div>A calm, tactile personal notebook inspired by <b>Leonardo da Vinci’s</b> intellectual curiosity and <b>Apple’s</b> design precision.</div>
      <div><br></div>
      <div><b>Explore Your Workspace</b></div>
      <div>• Connect thoughts seamlessly: <a class="note-link" data-target="${noteGeometry.id}">Proportions & Spatial Harmony</a></div>
      <div>• Track tasks with interactive checklists: <a class="note-link" data-target="${noteChecklist.id}">Weekly Studio Checklist</a></div>
      <div>• Open the <b>Sketch & Markup Studio</b> (pen icon below) to draw diagrams on parchment or grid paper.</div>
      <div>• Use the <b>Reference Pane</b> icon in the toolbar to view two notes side-by-side while writing.</div>
      <div>• Type <code>[[</code> anywhere in a note to quickly link another entry.</div>`
    };

    return [welcomeNote, noteGeometry, noteChecklist];
  }

  function resetToStarterWorkspace(showNotification = true) {
    const folders = defaultFolders();
    const notes = defaultNotes(folders);
    state.folders = folders;
    state.notes = notes;
    state.activeFolderId = "all";
    state.activeTagFilter = null;
    state.searchQuery = "";
    state.searchScope = "all";
    state.activeNoteId = notes[0].id;
    persist();
    renderFolders();
    renderList();
    openNote(notes[0].id, false, true);
    if (showNotification) showToast("Starter Notebooks & Notes Restored");
  }

  async function loadState() {
    let raw = await StorageAdapter.get(STORAGE_KEY);
    if (!raw) raw = await StorageAdapter.get(LEGACY_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          state = Object.assign(state, parsed);
          if (!state.typography || typeof state.typography !== "object") {
            state.typography = { font: "sans", size: "medium", measure: "folio" };
          }
          state.notes = Array.isArray(state.notes) ? state.notes.map(n => ({ tags: [], ...n })) : [];
          state.folders = Array.isArray(state.folders) ? state.folders : [];
        }
      } catch (e) { console.error("Failed to parse saved state:", e); }
    }

    if (!Array.isArray(state.folders) || state.folders.length === 0) {
      state.folders = defaultFolders();
    }
    if (!Array.isArray(state.notes) || state.notes.length === 0) {
      state.notes = defaultNotes(state.folders);
      persist();
    }

    const validFolderIds = new Set(["notes", "quick-notes", ...state.folders.map(f => f.id)]);
    state.notes.forEach(n => {
      if (!validFolderIds.has(n.folderId)) n.folderId = "notes";
    });

    if (!state.activeFolderId) state.activeFolderId = "all";

    applyTheme();
    applyTypography();
    if (state.splitMode) document.body.classList.add("hide-list-pane");

    renderFolders();

    const initialVisible = visibleNotes();
    if (!state.activeNoteId || !state.notes.find(n => n.id === state.activeNoteId && !n.deleted)) {
      state.activeNoteId = initialVisible.length > 0 ? initialVisible[0].id : null;
    }

    renderList();
    if (state.activeNoteId) openNote(state.activeNoteId, false, true);
    else updateEmptyEditorState();

    if (state.referenceNoteId) openReferencePane(state.referenceNoteId);
  }

  let saveTimer = null;
  const saveIndicator = document.getElementById("save-indicator");
  function persist() {
    if (saveIndicator) {
      saveIndicator.classList.add("saving");
      saveIndicator.querySelector(".save-text").textContent = "Saving…";
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await StorageAdapter.set(STORAGE_KEY, JSON.stringify(state));
      if (saveIndicator) {
        saveIndicator.classList.remove("saving");
        saveIndicator.querySelector(".save-text").textContent = "Saved";
      }
    }, 220);
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2000);
  }

  function applyTheme() {
    document.body.setAttribute("data-theme", state.theme);
    document.querySelectorAll("#theme-options .typo-seg-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.themeVal === state.theme);
    });
  }

  function applyTypography() {
    const root = document.documentElement;
    const { font, size, measure } = state.typography;
    const fontMap = { sans: "var(--font-sans)", serif: "var(--font-serif)", mono: "var(--font-mono)" };
    const sizeMap = { small: "15px", medium: "16.5px", large: "18.5px" };
    const measureMap = { folio: "68ch", wide: "100%" };
    root.style.setProperty("--editor-font", fontMap[font] || fontMap.sans);
    root.style.setProperty("--editor-size", sizeMap[size] || sizeMap.medium);
    root.style.setProperty("--editor-measure", measureMap[measure] || measureMap.folio);

    document.querySelectorAll("#font-family-options .typo-seg-btn").forEach(b => b.classList.toggle("active", b.dataset.font === font));
    document.querySelectorAll("#font-size-options .typo-seg-btn").forEach(b => b.classList.toggle("active", b.dataset.size === size));
    document.querySelectorAll("#line-width-options .typo-seg-btn").forEach(b => b.classList.toggle("active", b.dataset.measure === measure));
  }

  const views = {
    folders: document.getElementById("view-folders"),
    list: document.getElementById("view-list"),
    editor: document.getElementById("view-editor")
  };

  function isMobileViewport() { return window.innerWidth <= 820; }

  function goTo(name) {
    if (!isMobileViewport()) return;
    Object.values(views).forEach(v => v.classList.remove("active"));
    if (name !== "folders") views[name].classList.add("active");
    views.folders.classList.toggle("root", name === "folders");
  }

  document.getElementById("toggle-sidebar-btn").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });

  document.getElementById("split-toggle").addEventListener("click", () => {
    state.splitMode = !state.splitMode;
    document.body.classList.toggle("hide-list-pane", state.splitMode);
    document.getElementById("split-toggle").classList.toggle("active-state", state.splitMode);
    persist();
    showToast(state.splitMode ? "Expanded Writing Pane" : "Split List & Editor View");
  });

  document.getElementById("focus-mode-btn").addEventListener("click", () => {
    const isFocus = document.body.classList.toggle("focus-mode");
    document.getElementById("focus-mode-btn").classList.toggle("active-state", isFocus);
    showToast(isFocus ? "Focus Mode Enabled (Esc to exit)" : "Focus Mode Off");
  });

  let isResizing = false;
  const resizer = document.getElementById("split-resizer-list");
  if (resizer) {
    resizer.addEventListener("mousedown", (e) => {
      isResizing = true; resizer.classList.add("active"); document.body.style.cursor = "col-resize"; e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const screenRect = document.getElementById("views").getBoundingClientRect();
      views.list.style.width = Math.max(250, Math.min(480, e.clientX - screenRect.left)) + "px";
    });
    document.addEventListener("mouseup", () => {
      if (isResizing) { isResizing = false; resizer.classList.remove("active"); document.body.style.cursor = ""; }
    });
  }

  function getAllTags() {
    const map = new Map();
    state.notes.filter(n => !n.deleted).forEach(n => {
      (n.tags || []).forEach(t => {
        const clean = t.toLowerCase().trim();
        if (clean) map.set(clean, (map.get(clean) || 0) + 1);
      });
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }

  function getRevisitNotes() {
    const active = state.notes.filter(n => !n.deleted);
    if (active.length <= 3) return active;
    const older = active.filter(n => (Date.now() - new Date(n.updatedAt).getTime()) > 86400000);
    return older.length > 0 ? older : active.slice(0, 5);
  }

  function folderNoteCount(id) {
    if (id === "all") return state.notes.filter(n => !n.deleted).length;
    if (id === "recently-deleted") return state.notes.filter(n => n.deleted).length;
    if (id === "quick-notes") return state.notes.filter(n => n.folderId === "quick-notes" && !n.deleted).length;
    if (id === "on-this-day") return getRevisitNotes().length;
    return state.notes.filter(n => n.folderId === id && !n.deleted).length;
  }

  function visibleNotes() {
    let list;
    if (state.activeFolderId === "recently-deleted") list = state.notes.filter(n => n.deleted);
    else if (state.activeFolderId === "on-this-day") list = getRevisitNotes();
    else if (state.activeFolderId === "all") list = state.notes.filter(n => !n.deleted);
    else list = state.notes.filter(n => n.folderId === state.activeFolderId && !n.deleted);

    if (state.activeTagFilter) list = list.filter(n => (n.tags || []).includes(state.activeTagFilter));
    if (state.searchScope === "pinned") list = list.filter(n => n.pinned);
    else if (state.searchScope === "checklists") list = list.filter(n => (n.html || "").includes("checklist"));
    else if (state.searchScope === "media") list = list.filter(n => (n.html || "").includes("<img"));

    const q = state.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(n => {
        const tmp = document.createElement("div");
        tmp.innerHTML = n.html;
        const textMatch = (tmp.textContent || "").toLowerCase().includes(q);
        const tagMatch = (n.tags || []).some(t => ("#" + t).includes(q) || t.includes(q));
        return textMatch || tagMatch;
      });
    }

    list.sort((a, b) => {
      if (state.activeFolderId !== "recently-deleted" && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (state.sortBy === "title") return getNoteText(a).title.localeCompare(getNoteText(b).title);
      if (state.sortBy === "created") return new Date(b.createdAt) - new Date(a.createdAt);
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return list;
  }

  function getNoteText(note) {
    const tmp = document.createElement("div");
    tmp.innerHTML = note.html || "";
    const titleEl = tmp.querySelector(".note-title-line");
    let title = titleEl ? titleEl.textContent.trim() : "";
    const full = (tmp.textContent || "").trim();
    if (!title) title = full.split("\n")[0].slice(0, 80);
    let snippet = full;
    if (titleEl) snippet = full.slice(titleEl.textContent.length).trim();
    return {
      title: title || "Untitled Entry",
      snippet: snippet.slice(0, 110),
      hasChecklist: (note.html || "").includes("checklist"),
      hasImage: (note.html || "").includes("<img")
    };
  }

  function formatDate(iso) {
    const d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const diff = Math.floor((now - d) / 86400000);
    if (diff < 7 && diff >= 0) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function formatFullDate(iso) {
    return new Date(iso).toLocaleString([], { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function renderFolders() {
    const qnCount = folderNoteCount("quick-notes");
    const allCount = folderNoteCount("all");
    const otdCount = folderNoteCount("on-this-day");
    const delCount = folderNoteCount("recently-deleted");

    document.getElementById("quicknotes-count").textContent = qnCount;
    document.getElementById("otd-count-mobile").textContent = otdCount;
    document.getElementById("desktop-quicknotes-count").textContent = qnCount;
    document.getElementById("desktop-all-count").textContent = allCount;
    document.getElementById("desktop-otd-count").textContent = otdCount;
    document.getElementById("desktop-deleted-count").textContent = delCount;

    ["quick-notes", "all", "on-this-day", "recently-deleted"].forEach(sysId => {
      const el = document.querySelector(`#folio-sidebar .fx-row[data-folder-id="${sysId}"]`);
      if (el) el.classList.toggle("selected-folder", state.activeFolderId === sysId);
    });

    const mobileCard = document.getElementById("icloud-card");
    const desktopCard = document.getElementById("desktop-icloud-card");
    mobileCard.innerHTML = "";
    desktopCard.innerHTML = "";

    mobileCard.appendChild(createFolderRow("all", "All Notes", "📚", allCount, false));

    state.folders.forEach(f => {
      const count = folderNoteCount(f.id);
      mobileCard.appendChild(createFolderRow(f.id, f.name, f.emoji || "📁", count, !f.system));
      desktopCard.appendChild(createFolderRow(f.id, f.name, f.emoji || "📁", count, !f.system));
    });

    mobileCard.appendChild(createFolderRow("recently-deleted", "Recently Deleted", "🗑️", delCount, false));

    const label = allCount + (allCount === 1 ? " Note" : " Notes");
    document.getElementById("folders-total-label").textContent = label;
    document.getElementById("desktop-total-label").textContent = label;

    renderTagsCloud();
  }

  function createFolderRow(id, name, iconRaw, count, removable) {
    const row = document.createElement("div");
    row.className = "fx-row" + (removable ? " custom" : "") + (state.activeFolderId === id ? " selected-folder" : "");
    row.innerHTML = `
      <div class="folder-remove ${removable ? "show" : ""}" title="Delete Folder">–</div>
      <span class="fx-icon">${iconRaw}</span>
      <span class="fx-name">${escapeHtml(name)}</span>
      <span class="fx-count">${count}</span>
      <svg class="fx-chev" width="8" height="14" viewBox="0 0 9 15" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 1l6 6.5L1 14"/></svg>
    `;
    row.addEventListener("click", () => {
      if (document.body.classList.contains("edit-mode") && removable) return;
      openFolder(id, name);
    });
    const rm = row.querySelector(".folder-remove");
    rm.addEventListener("click", (e) => { e.stopPropagation(); deleteFolder(id); });
    return row;
  }

  function renderTagsCloud() {
    const tags = getAllTags();
    const dHeader = document.getElementById("desktop-tags-header");
    const mHeader = document.getElementById("mobile-tags-header");
    const dCloud = document.getElementById("desktop-tags-cloud");
    const mCloud = document.getElementById("mobile-tags-cloud");
    const clearBtn = document.getElementById("clear-tag-filter");
    dCloud.innerHTML = ""; mCloud.innerHTML = "";
    if (tags.length === 0) { dHeader.style.display = "none"; mHeader.style.display = "none"; return; }
    dHeader.style.display = "flex"; mHeader.style.display = "flex";
    clearBtn.style.display = state.activeTagFilter ? "inline-block" : "none";

    tags.forEach(([tag, count]) => {
      [dCloud, mCloud].forEach(container => {
        const pill = document.createElement("button");
        pill.className = "tag-pill" + (state.activeTagFilter === tag ? " active" : "");
        pill.textContent = `#${tag} · ${count}`;
        pill.addEventListener("click", () => {
          state.activeTagFilter = (state.activeTagFilter === tag) ? null : tag;
          if (isMobileViewport() && state.activeTagFilter) openFolder("all", `#${tag}`);
          else { renderFolders(); renderList(); }
        });
        container.appendChild(pill);
      });
    });
  }

  document.getElementById("clear-tag-filter").addEventListener("click", () => {
    state.activeTagFilter = null; renderFolders(); renderList();
  });

  function deleteFolder(id) {
    iosConfirm("Delete Notebook?", "Notes inside will be safely moved to General Notes.", "Delete", true, () => {
      state.notes.forEach(n => { if (n.folderId === id) n.folderId = "notes"; });
      state.folders = state.folders.filter(f => f.id !== id);
      if (state.activeFolderId === id) state.activeFolderId = "all";
      renderFolders(); renderList(); persist(); showToast("Notebook Removed");
    });
  }

  function toggleFolderEditMode() {
    document.body.classList.toggle("edit-mode");
    const active = document.body.classList.contains("edit-mode");
    const label = active ? "Done" : "Edit";
    document.getElementById("edit-folders-btn").textContent = label;
    document.getElementById("desktop-edit-folders-btn").textContent = label;
    showToast(active ? "Edit Mode: Tap red – to remove custom notebooks" : "Edit Mode Off");
  }

  document.getElementById("edit-folders-btn").addEventListener("click", toggleFolderEditMode);
  document.getElementById("desktop-edit-folders-btn").addEventListener("click", toggleFolderEditMode);

  document.getElementById("desktop-quicknotes-row").addEventListener("click", () => openFolder("quick-notes", "Quick Notes"));
  document.getElementById("desktop-all-row").addEventListener("click", () => openFolder("all", "All Notes"));
  document.getElementById("desktop-otd-row").addEventListener("click", () => openFolder("on-this-day", "Revisit & Recent"));
  document.getElementById("desktop-deleted-row").addEventListener("click", () => openFolder("recently-deleted", "Recently Deleted"));
  document.getElementById("quicknotes-row").addEventListener("click", () => openFolder("quick-notes", "Quick Notes"));
  document.getElementById("otd-row-mobile").addEventListener("click", () => openFolder("on-this-day", "Revisit & Recent"));

  function promptCreateFolder() {
    iosPromptFolder((name, emoji) => {
      if (!name) return;
      state.folders.push({ id: uid(), name, emoji: emoji || "📓", system: false });
      renderFolders(); persist(); showToast("Notebook Created");
    });
  }
  document.getElementById("new-folder-btn").addEventListener("click", promptCreateFolder);
  document.getElementById("desktop-new-folder-btn").addEventListener("click", promptCreateFolder);

  function openFolder(id, name) {
    state.activeFolderId = id; selectMode = false; selectedNoteIds.clear(); updateBulkBar();
    document.getElementById("list-title").textContent = name;
    document.getElementById("back-label").textContent = "Folders";
    renderFolders(); renderList(); goTo("list");
  }

  document.getElementById("back-to-folders").addEventListener("click", () => { renderFolders(); goTo("folders"); });

  function renderList() {
    const wrap = document.getElementById("notes-list");
    wrap.innerHTML = "";
    const list = visibleNotes();
    document.getElementById("list-count-label").textContent = list.length + (list.length === 1 ? " Entry" : " Entries");

    const filterPill = document.getElementById("active-filter-pill");
    if (state.activeTagFilter) {
      filterPill.style.display = "inline-block";
      filterPill.textContent = `#${state.activeTagFilter} ✕`;
      filterPill.onclick = () => { state.activeTagFilter = null; renderFolders(); renderList(); };
    } else {
      filterPill.style.display = "none";
    }

    if (list.length === 0) {
      const e = document.createElement("div");
      e.id = "list-empty";
      e.innerHTML = `
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg>
        <div class="empty-title">${state.searchQuery || state.activeTagFilter || state.searchScope !== "all" ? "No Matching Entries" : "Empty Notebook"}</div>
        <div class="empty-sub">${state.searchQuery || state.searchScope !== "all" ? "Try another keyword or switch scope filter back to All." : "Tap the compose icon below to begin writing."}</div>
      `;
      wrap.appendChild(e);
      return;
    }

    let pinnedShown = false, othersShown = false;
    list.forEach(note => {
      if (state.activeFolderId !== "recently-deleted") {
        if (note.pinned && !pinnedShown) {
          const l = document.createElement("div"); l.className = "list-sec-label"; l.textContent = "Pinned";
          wrap.appendChild(l); pinnedShown = true;
        }
        if (!note.pinned && pinnedShown && !othersShown) {
          const l = document.createElement("div"); l.className = "list-sec-label"; l.textContent = "Entries";
          wrap.appendChild(l); othersShown = true;
        }
      }
      wrap.appendChild(createNoteRow(note));
    });
  }

  function createNoteRow(note) {
    const { title, snippet, hasChecklist, hasImage } = getNoteText(note);
    const row = document.createElement("div");
    row.className = "note-row" + (state.activeNoteId === note.id ? " active-note" : "");
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", state.activeNoteId === note.id ? "true" : "false");

    const tagsHtml = (note.tags || []).slice(0, 2).map(t => `<span class="mini-badge tag">#${escapeHtml(t)}</span>`).join("");
    const indicatorsHtml = `
      ${hasChecklist ? '<span class="mini-badge">☑ Checklist</span>' : ""}
      ${hasImage ? '<span class="mini-badge">✎ Sketch/Img</span>' : ""}
      ${tagsHtml}
    `;

    row.innerHTML = `
      <div class="note-row-top">
        ${selectMode ? `<input type="checkbox" class="note-select-chk" ${selectedNoteIds.has(note.id) ? "checked" : ""}>` : ""}
        ${note.pinned ? '<svg class="pin-ico" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.5 5.5L19 9l-4 4 1 6-4-3-4 3 1-6-4-4 5.5-1.5z"/></svg>' : ""}
        <span class="note-title">${escapeHtml(title)}</span>
      </div>
      <div class="note-meta"><span class="date">${formatDate(note.updatedAt)}</span>${snippet ? " · " + escapeHtml(snippet) : ""}</div>
      ${indicatorsHtml.trim() ? `<div class="note-row-badges">${indicatorsHtml}</div>` : ""}
    `;

    row.addEventListener("click", () => {
      if (selectMode) {
        if (selectedNoteIds.has(note.id)) selectedNoteIds.delete(note.id);
        else selectedNoteIds.add(note.id);
        renderList(); updateBulkBar(); return;
      }
      if (state.activeFolderId === "recently-deleted") {
        iosConfirm(title, "Restore this note to your notebook?", "Restore", false, () => {
          note.deleted = false; renderFolders(); renderList(); persist(); showToast("Note Restored");
        });
      } else {
        openNote(note.id, false);
      }
    });

    return row;
  }

  const searchInput = document.getElementById("search-input");
  const searchClearBtn = document.getElementById("search-clear-btn");

  searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    searchClearBtn.style.display = state.searchQuery ? "flex" : "none";
    renderList();
  });

  searchClearBtn.addEventListener("click", () => {
    state.searchQuery = ""; searchInput.value = ""; searchClearBtn.style.display = "none"; renderList();
  });

  document.querySelectorAll("#search-filters .filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#search-filters .filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.searchScope = chip.dataset.filter;
      renderList();
    });
  });

  document.getElementById("sort-notes-btn").addEventListener("click", () => openSheet("sort-sheet"));
  document.getElementById("sort-cancel").addEventListener("click", () => closeSheet("sort-sheet"));
  document.querySelectorAll("#sort-sheet .as-btn[data-sort]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.sortBy = btn.dataset.sort; closeSheet("sort-sheet"); renderList(); persist();
      showToast("Sorted by " + btn.textContent.replace("Sort by ", ""));
    });
  });

  document.getElementById("edit-list-btn").addEventListener("click", () => {
    selectMode = !selectMode; selectedNoteIds.clear();
    document.getElementById("edit-list-btn").textContent = selectMode ? "Done" : "Select";
    updateBulkBar(); renderList();
  });

  function updateBulkBar() {
    const bar = document.getElementById("bulk-action-bar");
    bar.style.display = selectMode ? "flex" : "none";
    document.getElementById("bulk-selected-count").textContent = `${selectedNoteIds.size} selected`;
  }

  document.getElementById("bulk-delete-btn").addEventListener("click", () => {
    if (selectedNoteIds.size === 0) return;
    state.notes.forEach(n => { if (selectedNoteIds.has(n.id)) { n.deleted = true; n.pinned = false; } });
    selectMode = false; selectedNoteIds.clear();
    document.getElementById("edit-list-btn").textContent = "Select";
    updateBulkBar(); persist(); renderFolders(); renderList();
    showToast("Moved Selected to Recently Deleted");
  });

  document.getElementById("bulk-move-btn").addEventListener("click", () => {
    if (selectedNoteIds.size === 0) return;
    openMoveFolderSheet(true);
  });

  document.getElementById("compose-from-list").addEventListener("click", createNoteInCurrentFolder);
  document.getElementById("empty-create-note-btn").addEventListener("click", createNoteInCurrentFolder);
  document.getElementById("compose-from-folders").addEventListener("click", () => {
    if (!state.activeFolderId || ["all", "recently-deleted", "on-this-day"].includes(state.activeFolderId)) {
      state.activeFolderId = "notes";
    }
    createNoteInCurrentFolder();
  });

  function createNoteInCurrentFolder() {
    let folderId = state.activeFolderId;
    if (!folderId || ["all", "recently-deleted", "on-this-day"].includes(folderId)) folderId = "notes";
    const note = {
      id: uid(), folderId, pinned: false, deleted: false,
      tags: state.activeTagFilter ? [state.activeTagFilter] : [],
      createdAt: nowISO(), updatedAt: nowISO(),
      html: '<h1 class="note-title-line"><br></h1>'
    };
    state.notes.unshift(note);
    persist(); renderFolders(); renderList(); openNote(note.id, true);
  }

  const noteBody = document.getElementById("note-body");
  function currentNote() { return state.notes.find(n => n.id === state.activeNoteId); }

  function updateEmptyEditorState() {
    const emptyState = document.getElementById("editor-empty-state");
    const note = currentNote();
    emptyState.style.display = (!isMobileViewport() && (!note || note.deleted)) ? "flex" : "none";
  }

  function openNote(id, focusNow, skipSavePrevious) {
    if (!skipSavePrevious) saveCurrentNoteFromDOM();
    state.activeNoteId = id;
    const note = currentNote();
    updateEmptyEditorState();
    if (!note) return;

    noteBody.innerHTML = note.html || '<h1 class="note-title-line"><br></h1>';
    document.getElementById("editor-date").textContent = formatFullDate(note.updatedAt);

    const folder = state.folders.find(f => f.id === note.folderId);
    document.getElementById("back-to-list-label").textContent =
      folder ? folder.name : (note.folderId === "quick-notes" ? "Quick Notes" : "Notes");

    renderNoteTags(note);
    renderBacklinks(note.id);
    updateEditorStats();
    renderList();
    goTo("editor");

    if (focusNow) {
      setTimeout(() => {
        noteBody.focus();
        const t = noteBody.querySelector(".note-title-line");
        if (t) placeCaretAtEnd(t);
      }, 120);
    }
  }

  document.getElementById("back-to-list").addEventListener("click", () => {
    saveCurrentNoteFromDOM(); renderFolders(); renderList(); goTo("list");
  });

  function updateEditorStats() {
    const text = (noteBody.textContent || "").trim();
    const words = text ? text.split(/\s+/).length : 0;
    const mins = Math.max(1, Math.ceil(words / 225));
    document.getElementById("editor-stats").textContent = `${words} ${words === 1 ? "word" : "words"} · ${mins} min read`;
  }

  function saveCurrentNoteFromDOM() {
    const note = currentNote();
    if (!note) return;
    const html = noteBody.innerHTML;
    if (html !== note.html) {
      note.html = html; note.updatedAt = nowISO(); persist(); renderList();
    }
  }

  let bodyDebounce = null;
  noteBody.addEventListener("input", () => {
    updateEditorStats();
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const container = range.startContainer;
      if (container.nodeType === 3) {
        const textBefore = container.textContent.slice(0, range.startOffset);
        if (textBefore.endsWith("[[")) {
          container.textContent = container.textContent.slice(0, range.startOffset - 2) + container.textContent.slice(range.startOffset);
          openLinkPicker();
          return;
        }
      }
    }
    clearTimeout(bodyDebounce);
    bodyDebounce = setTimeout(() => {
      saveCurrentNoteFromDOM();
      const note = currentNote();
      if (note) document.getElementById("editor-date").textContent = formatFullDate(note.updatedAt);
    }, 280);
  });

  noteBody.addEventListener("focus", () => {
    if (!noteBody.querySelector(".note-title-line") && noteBody.textContent.trim() === "") {
      noteBody.innerHTML = '<h1 class="note-title-line"><br></h1>';
      placeCaretAtEnd(noteBody.firstChild);
    }
  });

  function placeCaretAtEnd(el) {
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el); range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  }

  function renderNoteTags(note) {
    const container = document.getElementById("note-tags-list");
    container.innerHTML = "";
    (note.tags || []).forEach(tag => {
      const chip = document.createElement("span");
      chip.className = "note-tag-chip";
      chip.innerHTML = `#${escapeHtml(tag)} <button title="Remove Tag">✕</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        note.tags = note.tags.filter(t => t !== tag);
        persist(); renderNoteTags(note); renderFolders(); renderList();
      });
      container.appendChild(chip);
    });
  }

  document.getElementById("add-tag-btn").addEventListener("click", () => {
    const note = currentNote();
    if (!note) return;
    iosPromptSingle("Add Tag", "Enter a topic keyword (e.g., design, research, ideas)", "Tag name", (raw) => {
      const clean = raw.replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "-");
      if (!clean) return;
      if (!note.tags) note.tags = [];
      if (!note.tags.includes(clean)) {
        note.tags.push(clean);
        persist(); renderNoteTags(note); renderFolders(); renderList(); showToast(`Added #${clean}`);
      }
    });
  });

  function renderBacklinks(targetId) {
    const section = document.getElementById("backlinks-section");
    const list = document.getElementById("backlinks-list");
    list.innerHTML = "";
    const linkingNotes = state.notes.filter(
      n => !n.deleted && n.id !== targetId && (n.html || "").includes(`data-target="${targetId}"`)
    );
    if (linkingNotes.length === 0) { section.style.display = "none"; return; }
    section.style.display = "block";
    linkingNotes.forEach(n => {
      const { title } = getNoteText(n);
      const card = document.createElement("button");
      card.className = "backlink-card";
      card.innerHTML = `<span>↗</span> <span>${escapeHtml(title)}</span>`;
      card.addEventListener("click", () => openNote(n.id, false));
      list.appendChild(card);
    });
  }

  noteBody.addEventListener("click", (e) => {
    const link = e.target.closest("a.note-link");
    if (link) {
      e.preventDefault();
      const targetId = link.dataset.target;
      if (state.notes.find(n => n.id === targetId && !n.deleted)) openNote(targetId, false);
      else showToast("Linked note is in Recently Deleted or missing");
      return;
    }
    if (e.target.classList.contains("chk")) {
      const li = e.target.closest("li");
      li.classList.toggle("checked");
      saveCurrentNoteFromDOM(); renderList();
    }
  });

  noteBody.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === 3) node = node.parentNode;

      const li = node.closest ? node.closest("li") : null;
      if (li && li.closest("ul.checklist")) {
        e.preventDefault();
        const textSpan = li.querySelector(".chk-text");
        if (textSpan && textSpan.textContent.trim() === "") {
          const ul = li.closest("ul");
          const div = document.createElement("div"); div.innerHTML = "<br>";
          ul.parentNode.insertBefore(div, ul.nextSibling);
          li.remove(); if (ul.children.length === 0) ul.remove();
          placeCaretAtEnd(div);
        } else {
          const newLi = document.createElement("li");
          newLi.innerHTML = '<span class="chk"></span><span class="chk-text" contenteditable="true"></span>';
          li.parentNode.insertBefore(newLi, li.nextSibling);
          placeCaretAtEnd(newLi.querySelector(".chk-text"));
        }
        saveCurrentNoteFromDOM(); return;
      }

      const titleLine = node.closest ? node.closest(".note-title-line") : null;
      if (titleLine) {
        e.preventDefault();
        const div = document.createElement("div"); div.innerHTML = "<br>";
        titleLine.parentNode.insertBefore(div, titleLine.nextSibling);
        placeCaretAtEnd(div);
      }
    }
  });

  document.getElementById("compose-from-editor").addEventListener("click", createNoteInCurrentFolder);
  document.getElementById("undo-btn").addEventListener("mousedown", (e) => { e.preventDefault(); noteBody.focus(); document.execCommand("undo"); });
  document.getElementById("redo-btn").addEventListener("mousedown", (e) => { e.preventDefault(); noteBody.focus(); document.execCommand("redo"); });

  function openReferencePane(targetId) {
    const candidates = state.notes.filter(n => !n.deleted && n.id !== state.activeNoteId);
    if (candidates.length === 0) { showToast("Create another note first to view side-by-side"); return; }
    const chosenId = (targetId && candidates.find(c => c.id === targetId)) ? targetId : candidates[0].id;
    state.referenceNoteId = chosenId;

    const select = document.getElementById("reference-note-select");
    select.innerHTML = "";
    candidates.forEach(n => {
      const opt = document.createElement("option");
      opt.value = n.id; opt.textContent = getNoteText(n).title;
      if (n.id === chosenId) opt.selected = true;
      select.appendChild(opt);
    });

    renderReferenceContent(chosenId);
    document.getElementById("reference-pane").style.display = "flex";
    document.getElementById("ref-pane-btn").classList.add("active-state");
    persist();
  }

  function renderReferenceContent(id) {
    const note = state.notes.find(n => n.id === id);
    const box = document.getElementById("reference-note-content");
    box.innerHTML = note ? note.html : "<em>Note unavailable.</em>";
  }

  document.getElementById("reference-note-select").addEventListener("change", (e) => {
    state.referenceNoteId = e.target.value; renderReferenceContent(state.referenceNoteId); persist();
  });
  document.getElementById("ref-pane-btn").addEventListener("click", () => {
    if (document.getElementById("reference-pane").style.display === "flex") closeReferencePane();
    else openReferencePane();
  });
  document.getElementById("close-reference-pane").addEventListener("click", closeReferencePane);

  function closeReferencePane() {
    state.referenceNoteId = null;
    document.getElementById("reference-pane").style.display = "none";
    document.getElementById("ref-pane-btn").classList.remove("active-state");
    persist();
  }

  document.getElementById("bold-btn").addEventListener("mousedown", (e) => { e.preventDefault(); noteBody.focus(); document.execCommand("bold"); saveCurrentNoteFromDOM(); });
  document.getElementById("italic-btn").addEventListener("mousedown", (e) => { e.preventDefault(); noteBody.focus(); document.execCommand("italic"); saveCurrentNoteFromDOM(); });
  document.getElementById("underline-btn").addEventListener("mousedown", (e) => { e.preventDefault(); noteBody.focus(); document.execCommand("underline"); saveCurrentNoteFromDOM(); });

  document.getElementById("highlight-btn").addEventListener("mousedown", (e) => {
    e.preventDefault(); noteBody.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { showToast("Select text first to apply Warm Ink highlight"); return; }
    const range = sel.getRangeAt(0);
    const mark = document.createElement("mark"); mark.className = "warm-ink";
    try { range.surroundContents(mark); } catch (err) { document.execCommand("hiliteColor", false, "rgba(235, 185, 72, 0.35)"); }
    saveCurrentNoteFromDOM();
  });

  document.getElementById("quote-btn").addEventListener("mousedown", (e) => { e.preventDefault(); applyBlockStyle("quote"); });
  document.getElementById("bulleted-btn").addEventListener("mousedown", (e) => { e.preventDefault(); noteBody.focus(); document.execCommand("insertUnorderedList"); saveCurrentNoteFromDOM(); });
  document.getElementById("numbered-btn").addEventListener("mousedown", (e) => { e.preventDefault(); noteBody.focus(); document.execCommand("insertOrderedList"); saveCurrentNoteFromDOM(); });
  document.getElementById("link-note-btn").addEventListener("click", openLinkPicker);

  const aaMenu = document.getElementById("aa-menu");
  const typoMenu = document.getElementById("typography-menu");

  document.getElementById("aa-btn").addEventListener("click", (e) => {
    e.stopPropagation(); typoMenu.classList.remove("open");
    const btn = e.currentTarget.getBoundingClientRect();
    const screen = document.getElementById("screen").getBoundingClientRect();
    aaMenu.style.left = Math.max(12, Math.min(screen.width - 232, btn.left - screen.left)) + "px";
    aaMenu.style.bottom = (screen.bottom - btn.top + 8) + "px";
    aaMenu.classList.toggle("open");
  });

  document.getElementById("typography-btn").addEventListener("click", (e) => {
    e.stopPropagation(); aaMenu.classList.remove("open");
    const btn = e.currentTarget.getBoundingClientRect();
    const screen = document.getElementById("screen").getBoundingClientRect();
    typoMenu.style.right = Math.max(12, screen.right - btn.right) + "px";
    typoMenu.style.top = (btn.bottom - screen.top + 8) + "px";
    typoMenu.classList.toggle("open");
  });

  document.getElementById("screen").addEventListener("click", () => { aaMenu.classList.remove("open"); typoMenu.classList.remove("open"); });
  aaMenu.addEventListener("click", e => e.stopPropagation());
  typoMenu.addEventListener("click", e => e.stopPropagation());

  document.querySelectorAll("#font-family-options .typo-seg-btn").forEach(btn => btn.addEventListener("click", () => { state.typography.font = btn.dataset.font; applyTypography(); persist(); }));
  document.querySelectorAll("#font-size-options .typo-seg-btn").forEach(btn => btn.addEventListener("click", () => { state.typography.size = btn.dataset.size; applyTypography(); persist(); }));
  document.querySelectorAll("#line-width-options .typo-seg-btn").forEach(btn => btn.addEventListener("click", () => { state.typography.measure = btn.dataset.measure; applyTypography(); persist(); }));
  document.querySelectorAll("#theme-options .typo-seg-btn").forEach(btn => btn.addEventListener("click", () => { state.theme = btn.dataset.themeVal; applyTheme(); persist(); }));

  function toggleTheme() { state.theme = state.theme === "dark" ? "light" : "dark"; applyTheme(); persist(); }
  document.getElementById("sidebar-theme-btn").addEventListener("click", toggleTheme);
  document.getElementById("mobile-theme-btn").addEventListener("click", toggleTheme);

  aaMenu.querySelectorAll(".aa-item").forEach(item => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault(); const style = item.dataset.style; aaMenu.classList.remove("open");
      if (style === "link") { openLinkPicker(); return; }
      if (style === "divider") { insertGeometricDivider(); return; }
      applyBlockStyle(style);
    });
  });

  function getSelectedBlock() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentNode;
    while (node && node !== noteBody && !["DIV", "H1", "H2", "H3", "P", "LI", "BLOCKQUOTE", "PRE"].includes(node.tagName)) {
      node = node.parentNode;
    }
    return (node === noteBody || !node) ? null : node;
  }

  function applyBlockStyle(style) {
    noteBody.focus();
    if (["bulleted", "dashed", "numbered"].includes(style)) { insertList(style); return; }
    const block = getSelectedBlock();
    const tagMap = { title: "h1", heading: "h2", subheading: "h3", quote: "blockquote", mono: "pre", body: "div" };
    const tag = tagMap[style] || "div";
    const el = document.createElement(tag);
    if (style === "title") el.className = "note-title-line";
    if (style === "quote") el.className = "folio-quote";
    if (style === "mono") el.className = "folio-mono";
    if (block) { el.innerHTML = block.innerHTML || "<br>"; block.parentNode.replaceChild(el, block); }
    else { el.innerHTML = "<br>"; noteBody.appendChild(el); }
    placeCaretAtEnd(el); saveCurrentNoteFromDOM();
  }

  function insertGeometricDivider() {
    noteBody.focus();
    const hr = document.createElement("div"); hr.className = "folio-rule"; hr.contentEditable = "false";
    hr.innerHTML = '<span class="rule-diamond"></span>';
    const nextDiv = document.createElement("div"); nextDiv.innerHTML = "<br>";
    const block = getSelectedBlock();
    if (block && block.parentNode) { block.parentNode.insertBefore(hr, block.nextSibling); block.parentNode.insertBefore(nextDiv, hr.nextSibling); }
    else { noteBody.appendChild(hr); noteBody.appendChild(nextDiv); }
    placeCaretAtEnd(nextDiv); saveCurrentNoteFromDOM();
  }

  function insertList(kind) {
    const outer = kind === "numbered" ? "ol" : "ul";
    const ul = document.createElement(outer); ul.className = kind;
    const li = document.createElement("li"); li.textContent = "New item"; ul.appendChild(li);
    const block = getSelectedBlock();
    if (block && block.parentNode) block.parentNode.insertBefore(ul, block.nextSibling);
    else noteBody.appendChild(ul);
    placeCaretAtEnd(li); saveCurrentNoteFromDOM();
  }

  document.getElementById("checklist-btn").addEventListener("mousedown", (e) => {
    e.preventDefault(); noteBody.focus();
    const ul = document.createElement("ul"); ul.className = "checklist";
    const li = document.createElement("li"); li.innerHTML = '<span class="chk"></span><span class="chk-text" contenteditable="true">New task</span>';
    ul.appendChild(li);
    const block = getSelectedBlock();
    if (block && block.parentNode) block.parentNode.insertBefore(ul, block.nextSibling);
    else noteBody.appendChild(ul);
    placeCaretAtEnd(li.querySelector(".chk-text")); saveCurrentNoteFromDOM();
  });

  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = "image/*"; document.body.appendChild(fileInput);
  document.getElementById("attach-btn").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imgObj = new Image();
      imgObj.onload = () => {
        const maxDim = 1280;
        let w = imgObj.width, h = imgObj.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        const offscreen = document.createElement("canvas");
        offscreen.width = w; offscreen.height = h;
        offscreen.getContext("2d").drawImage(imgObj, 0, 0, w, h);
        const compressedUrl = offscreen.toDataURL("image/jpeg", 0.84);

        noteBody.focus();
        const img = document.createElement("img");
        img.className = "note-img"; img.src = compressedUrl; img.alt = file.name || "Attached image";
        const block = getSelectedBlock();
        if (block && block.parentNode) block.parentNode.insertBefore(img, block.nextSibling);
        else noteBody.appendChild(img);
        saveCurrentNoteFromDOM(); showToast("Image Inserted");
      };
      imgObj.src = reader.result;
    };
    reader.readAsDataURL(file); fileInput.value = "";
  });

  const drawModal = document.getElementById("draw-modal");
  const canvas = document.getElementById("draw-canvas");
  const canvasWrap = document.getElementById("draw-canvas-wrap");
  const ctx = canvas.getContext("2d");

  let drawColor = "#2C241B", drawTool = "pen", drawWidth = 2, canvasBgMode = "parchment";
  let drawing = false, startX = 0, startY = 0, lastX = 0, lastY = 0, snapshotImage = null, drawHistory = [];

  function resizeCanvas() {
    const rect = canvasWrap.getBoundingClientRect();
    canvas.width = rect.width * 2; canvas.height = rect.height * 2;
    canvas.style.width = rect.width + "px"; canvas.style.height = rect.height + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(2, 2);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    drawHistory = []; saveDrawSnapshot();
  }

  function saveDrawSnapshot() {
    drawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (drawHistory.length > 25) drawHistory.shift();
  }

  document.getElementById("markup-btn").addEventListener("click", () => { drawModal.classList.add("open"); setTimeout(resizeCanvas, 35); });
  document.getElementById("draw-cancel").addEventListener("click", () => drawModal.classList.remove("open"));
  document.getElementById("draw-undo").addEventListener("click", () => {
    if (drawHistory.length > 1) { drawHistory.pop(); ctx.putImageData(drawHistory[drawHistory.length - 1], 0, 0); }
  });
  document.getElementById("draw-clear").addEventListener("click", () => { ctx.clearRect(0, 0, canvas.width, canvas.height); saveDrawSnapshot(); });

  document.querySelectorAll(".bg-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".bg-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active"); canvasBgMode = pill.dataset.canvasBg; canvasWrap.className = `bg-${canvasBgMode}`;
    });
  });

  document.querySelectorAll(".tool-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); drawTool = btn.dataset.tool;
    });
  });

  document.querySelectorAll(".stroke-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".stroke-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); drawWidth = Number(btn.dataset.width);
    });
  });

  document.querySelectorAll(".swatch").forEach(sw => {
    sw.addEventListener("click", () => {
      document.querySelectorAll(".swatch").forEach(s => s.classList.remove("active"));
      sw.classList.add("active"); drawColor = sw.dataset.color;
    });
  });

  function posFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    drawing = true; const p = posFromEvent(e); startX = lastX = p.x; startY = lastY = p.y;
    snapshotImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = posFromEvent(e);
    ctx.save();
    if (drawTool === "eraser") {
      ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = drawWidth * 4;
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    } else if (drawTool === "pen" || drawTool === "highlighter") {
      ctx.globalAlpha = drawTool === "highlighter" ? 0.28 : 1; ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawTool === "highlighter" ? drawWidth * 4 : drawWidth;
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    } else if (drawTool === "line" || drawTool === "circle") {
      ctx.putImageData(snapshotImage, 0, 0); ctx.strokeStyle = drawColor; ctx.lineWidth = drawWidth;
      ctx.beginPath();
      if (drawTool === "line") { ctx.moveTo(startX, startY); ctx.lineTo(p.x, p.y); }
      else { ctx.arc(startX, startY, Math.hypot(p.x - startX, p.y - startY), 0, Math.PI * 2); }
      ctx.stroke();
    }
    ctx.restore();
    lastX = p.x; lastY = p.y;
  });

  window.addEventListener("pointerup", () => { if (drawing) { drawing = false; saveDrawSnapshot(); } });

  document.getElementById("draw-done").addEventListener("click", () => {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width; exportCanvas.height = canvas.height;
    const eCtx = exportCanvas.getContext("2d");
    eCtx.fillStyle = canvasBgMode === "dark" ? "#181715" : "#FAF5EA";
    eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    if (canvasBgMode === "grid") {
      eCtx.strokeStyle = "rgba(184, 115, 20, 0.16)"; eCtx.lineWidth = 2;
      for (let x = 0; x < exportCanvas.width; x += 48) { eCtx.beginPath(); eCtx.moveTo(x, 0); eCtx.lineTo(x, exportCanvas.height); eCtx.stroke(); }
      for (let y = 0; y < exportCanvas.height; y += 48) { eCtx.beginPath(); eCtx.moveTo(0, y); eCtx.lineTo(exportCanvas.width, y); eCtx.stroke(); }
    }

    eCtx.drawImage(canvas, 0, 0);
    const dataUrl = exportCanvas.toDataURL("image/png");
    noteBody.focus();
    const img = document.createElement("img"); img.className = "note-img"; img.src = dataUrl; img.alt = "Hand-drawn sketch";
    const block = getSelectedBlock();
    if (block && block.parentNode) block.parentNode.insertBefore(img, block.nextSibling);
    else noteBody.appendChild(img);

    saveCurrentNoteFromDOM(); drawModal.classList.remove("open"); showToast("Sketch Inserted into Folio");
  });

  const linkPickerSearch = document.getElementById("linkpicker-search");
  function openLinkPicker() {
    linkPickerSearch.value = ""; renderLinkPickerList(""); openSheet("linkpicker-sheet");
    setTimeout(() => linkPickerSearch.focus(), 100);
  }

  function renderLinkPickerList(query) {
    const list = document.getElementById("linkpicker-list"); list.innerHTML = "";
    const q = query.trim().toLowerCase();
    const candidates = state.notes.filter(n => {
      if (n.deleted || n.id === state.activeNoteId) return false;
      return !q || getNoteText(n).title.toLowerCase().includes(q);
    });
    if (candidates.length === 0) {
      const b = document.createElement("div"); b.className = "as-btn"; b.style.color = "var(--text-secondary)";
      b.textContent = "No matching notes found"; list.appendChild(b); return;
    }
    candidates.slice(0, 25).forEach(n => {
      const { title } = getNoteText(n);
      const b = document.createElement("button"); b.className = "as-btn"; b.textContent = title;
      b.addEventListener("click", () => {
        noteBody.focus();
        const a = document.createElement("a"); a.className = "note-link"; a.dataset.target = n.id; a.textContent = title;
        const space = document.createTextNode("\u00A0");
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const r = sel.getRangeAt(0); r.deleteContents(); r.insertNode(space); r.insertNode(a);
          r.setStartAfter(space); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
        } else { noteBody.appendChild(a); noteBody.appendChild(space); }
        saveCurrentNoteFromDOM(); closeSheet("linkpicker-sheet"); showToast("Linked to " + title);
      });
      list.appendChild(b);
    });
  }

  linkPickerSearch.addEventListener("input", (e) => renderLinkPickerList(e.target.value));
  document.getElementById("linkpicker-cancel").addEventListener("click", () => closeSheet("linkpicker-sheet"));

  const backdrop = document.getElementById("backdrop");
  function openSheet(id) { backdrop.classList.add("show"); document.getElementById(id).classList.add("show"); }
  function closeSheet(id) {
    document.getElementById(id).classList.remove("show");
    if (document.querySelectorAll(".actionsheet.show").length === 0) backdrop.classList.remove("show");
  }
  backdrop.addEventListener("click", () => {
    document.querySelectorAll(".actionsheet.show").forEach(s => s.classList.remove("show"));
    backdrop.classList.remove("show");
  });

  document.getElementById("more-btn").addEventListener("click", () => {
    const note = currentNote();
    document.getElementById("as-pin").textContent = note && note.pinned ? "Unpin Note" : "Pin Note";
    openSheet("more-sheet");
  });
  document.getElementById("as-cancel").addEventListener("click", () => closeSheet("more-sheet"));

  document.getElementById("as-pin").addEventListener("click", () => {
    const note = currentNote(); if (!note) return;
    note.pinned = !note.pinned; persist(); renderList(); closeSheet("more-sheet");
    showToast(note.pinned ? "Pinned to Top" : "Unpinned");
  });

  document.getElementById("as-duplicate").addEventListener("click", () => {
    const note = currentNote(); if (!note) return;
    const copy = {
      ...note, id: uid(), pinned: false, tags: [...(note.tags || [])],
      createdAt: nowISO(), updatedAt: nowISO(), html: note.html.replace(/<\/h1>/, " (Copy)</h1>")
    };
    state.notes.unshift(copy); persist(); renderFolders(); renderList(); openNote(copy.id, false);
    closeSheet("more-sheet"); showToast("Note Duplicated");
  });

  document.getElementById("as-ref-open").addEventListener("click", () => {
    closeSheet("more-sheet"); const note = currentNote(); if (note) openReferencePane(note.id);
  });

  document.getElementById("as-theme").addEventListener("click", () => { toggleTheme(); closeSheet("more-sheet"); });

  document.getElementById("as-delete").addEventListener("click", () => {
    closeSheet("more-sheet"); const note = currentNote(); if (!note) return;
    if (note.deleted) {
      iosConfirm("Delete Permanently?", "This note will be permanently erased.", "Delete", true, () => {
        state.notes = state.notes.filter(n => n.id !== note.id); state.activeNoteId = null;
        persist(); renderFolders(); renderList(); updateEmptyEditorState(); goTo("list");
      });
    } else {
      note.deleted = true; note.pinned = false; state.activeNoteId = null;
      persist(); renderFolders(); renderList(); updateEmptyEditorState(); goTo("list");
      showToast("Moved to Recently Deleted");
    }
  });

  function openMoveFolderSheet(isBulk) {
    const list = document.getElementById("movefolder-list"); list.innerHTML = "";
    state.folders.forEach(f => {
      const b = document.createElement("button"); b.className = "as-btn";
      b.textContent = (f.emoji ? f.emoji + " " : "") + f.name;
      b.addEventListener("click", () => {
        if (isBulk) {
          state.notes.forEach(n => { if (selectedNoteIds.has(n.id)) n.folderId = f.id; });
          selectMode = false; selectedNoteIds.clear();
          document.getElementById("edit-list-btn").textContent = "Select";
          updateBulkBar(); showToast("Moved Selected Notes to " + f.name);
        } else {
          const note = currentNote();
          if (note) { note.folderId = f.id; document.getElementById("back-to-list-label").textContent = f.name; showToast("Moved to " + f.name); }
        }
        persist(); renderFolders(); renderList(); closeSheet("movefolder-sheet");
      });
      list.appendChild(b);
    });
    openSheet("movefolder-sheet");
  }

  document.getElementById("as-move").addEventListener("click", () => { closeSheet("more-sheet"); openMoveFolderSheet(false); });
  document.getElementById("movefolder-cancel").addEventListener("click", () => closeSheet("movefolder-sheet"));

  function convertNoteToMarkdown(note) {
    const tmp = document.createElement("div"); tmp.innerHTML = note.html || "";
    let lines = [];
    if (note.tags && note.tags.length > 0) { lines.push("Tags: " + note.tags.map(t => "#" + t).join(" ")); lines.push(""); }
    tmp.childNodes.forEach(node => {
      if (node.nodeType === 3) { const txt = node.textContent.trim(); if (txt) lines.push(txt); return; }
      const tag = node.tagName;
      if (tag === "H1") lines.push("# " + node.textContent.trim());
      else if (tag === "H2") lines.push("## " + node.textContent.trim());
      else if (tag === "H3") lines.push("### " + node.textContent.trim());
      else if (tag === "BLOCKQUOTE") lines.push("> " + node.textContent.trim());
      else if (tag === "PRE") lines.push("```\n" + node.textContent + "\n```");
      else if (tag === "UL" && node.classList.contains("checklist")) {
        node.querySelectorAll("li").forEach(li => lines.push(`- [${li.classList.contains("checked") ? "x" : " "}] ${li.textContent.trim()}`));
      } else if (tag === "UL") {
        node.querySelectorAll("li").forEach(li => lines.push(`- ${li.textContent.trim()}`));
      } else if (tag === "OL") {
        node.querySelectorAll("li").forEach((li, idx) => lines.push(`${idx + 1}. ${li.textContent.trim()}`));
      } else {
        const txt = node.textContent.trim(); if (txt) lines.push(txt);
      }
    });
    return lines.join("\n\n");
  }

  document.getElementById("share-btn").addEventListener("click", () => openSheet("share-sheet"));
  document.getElementById("share-cancel").addEventListener("click", () => closeSheet("share-sheet"));

  document.getElementById("share-copy").addEventListener("click", () => {
    const note = currentNote(); if (!note) return;
    const tmp = document.createElement("div"); tmp.innerHTML = note.html;
    navigator.clipboard?.writeText(tmp.textContent || "").catch(() => {});
    closeSheet("share-sheet"); showToast("Plain Text Copied");
  });

  document.getElementById("share-copy-md").addEventListener("click", () => {
    const note = currentNote(); if (!note) return;
    navigator.clipboard?.writeText(convertNoteToMarkdown(note)).catch(() => {});
    closeSheet("share-sheet"); showToast("Markdown Copied to Clipboard");
  });

  document.getElementById("share-download-md").addEventListener("click", () => {
    const note = currentNote(); if (!note) return;
    downloadFile(convertNoteToMarkdown(note), (getNoteText(note).title || "Note") + ".md", "text/markdown");
    closeSheet("share-sheet");
  });

  document.getElementById("share-download").addEventListener("click", () => {
    const note = currentNote(); if (!note) return;
    const tmp = document.createElement("div"); tmp.innerHTML = note.html;
    downloadFile(tmp.textContent || "", (getNoteText(note).title || "Note") + ".txt", "text/plain");
    closeSheet("share-sheet");
  });

  document.getElementById("share-print").addEventListener("click", () => { closeSheet("share-sheet"); setTimeout(() => window.print(), 150); });

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  const vaultFileInput = document.createElement("input");
  vaultFileInput.type = "file"; vaultFileInput.accept = "application/json"; document.body.appendChild(vaultFileInput);

  vaultFileInput.addEventListener("change", () => {
    const file = vaultFileInput.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (Array.isArray(imported.folders) && Array.isArray(imported.notes)) {
          state.folders = imported.folders; state.notes = imported.notes;
          persist(); renderFolders(); renderList(); showToast("Vault Backup Restored Successfully");
        } else showToast("Invalid Vault Backup File");
      } catch (e) { showToast("Could not read JSON backup"); }
    };
    reader.readAsText(file); vaultFileInput.value = "";
  });

  document.getElementById("data-vault-btn").addEventListener("click", () => {
    const activeNotes = state.notes.filter(n => !n.deleted);
    const totalWords = activeNotes.reduce((acc, n) => {
      const tmp = document.createElement("div"); tmp.innerHTML = n.html || "";
      const w = (tmp.textContent || "").trim();
      return acc + (w ? w.split(/\s+/).length : 0);
    }, 0);

    alertBox.innerHTML = `
      <div class="ios-alert-title">Personal Data Vault</div>
      <div class="ios-alert-msg">Your notes live locally in your browser. Export a full backup anytime.</div>
      <div class="vault-stats-grid">
        <div class="vault-stat-box"><div class="vault-stat-num">${activeNotes.length}</div><div class="vault-stat-lbl">Notes</div></div>
        <div class="vault-stat-box"><div class="vault-stat-num">${state.folders.length}</div><div class="vault-stat-lbl">Notebooks</div></div>
        <div class="vault-stat-box"><div class="vault-stat-num">${totalWords}</div><div class="vault-stat-lbl">Words</div></div>
      </div>
      <div class="vault-actions-stack">
        <button class="vault-action-btn" id="vault-export-btn">Export Full Vault Backup (.json)</button>
        <button class="vault-action-btn" id="vault-import-btn">Restore From Backup (.json)</button>
        <button class="vault-action-btn" id="vault-seed-btn">Restore Starter Notebooks & Notes</button>
      </div>
      <div class="ios-alert-buttons"><button id="ia-close" class="bold">Done</button></div>
    `;
    alertBackdrop.classList.add("show");
    document.getElementById("vault-export-btn").onclick = () => {
      downloadFile(JSON.stringify({ exportedAt: nowISO(), version: "codex-v3", folders: state.folders, notes: state.notes }, null, 2),
        `codex-vault-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
      showToast("Vault Backup Downloaded");
    };
    document.getElementById("vault-import-btn").onclick = () => { alertBackdrop.classList.remove("show"); vaultFileInput.click(); };
    document.getElementById("vault-seed-btn").onclick = () => { alertBackdrop.classList.remove("show"); resetToStarterWorkspace(true); };
    document.getElementById("ia-close").onclick = () => alertBackdrop.classList.remove("show");
  });

  document.getElementById("shortcuts-help-btn").addEventListener("click", () => {
    alertBox.innerHTML = `
      <div class="ios-alert-title">Keyboard Shortcuts</div>
      <div class="ios-alert-msg">Navigate and write effortlessly</div>
      <div class="shortcuts-list">
        <div class="shortcut-item"><span>New Note</span><kbd>⌘ / Ctrl + N</kbd></div>
        <div class="shortcut-item"><span>Search Notes</span><kbd>⌘ / Ctrl + K</kbd></div>
        <div class="shortcut-item"><span>Link Another Note</span><kbd>Type [[</kbd></div>
        <div class="shortcut-item"><span>Toggle Dark / Light</span><kbd>⌘ / Ctrl + Shift + L</kbd></div>
        <div class="shortcut-item"><span>Exit Focus Mode</span><kbd>Esc</kbd></div>
      </div>
      <div class="ios-alert-buttons"><button id="ia-close" class="bold">Got It</button></div>
    `;
    alertBackdrop.classList.add("show");
    document.getElementById("ia-close").onclick = () => alertBackdrop.classList.remove("show");
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); createNoteInCurrentFolder(); }
    else if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); if (isMobileViewport()) goTo("list"); searchInput.focus(); }
    else if (mod && e.shiftKey && e.key.toLowerCase() === "l") { e.preventDefault(); toggleTheme(); }
    else if (e.key === "Escape") {
      if (document.body.classList.contains("focus-mode")) {
        document.body.classList.remove("focus-mode"); document.getElementById("focus-mode-btn").classList.remove("active-state");
      }
      aaMenu.classList.remove("open"); typoMenu.classList.remove("open"); alertBackdrop.classList.remove("show");
    }
  });

  const alertBackdrop = document.getElementById("alert-backdrop");
  const alertBox = document.getElementById("ios-alert-box");

  function iosConfirm(title, msg, okLabel, destructive, onOk) {
    alertBox.innerHTML = `
      <div class="ios-alert-title">${escapeHtml(title)}</div>
      <div class="ios-alert-msg">${escapeHtml(msg)}</div>
      <div class="ios-alert-buttons">
        <button id="ia-cancel">Cancel</button>
        <button id="ia-ok" class="bold" style="${destructive ? "color:var(--red);" : ""}">${escapeHtml(okLabel)}</button>
      </div>`;
    alertBackdrop.classList.add("show");
    document.getElementById("ia-cancel").onclick = () => alertBackdrop.classList.remove("show");
    document.getElementById("ia-ok").onclick = () => { alertBackdrop.classList.remove("show"); onOk(); };
  }

  function iosPromptSingle(title, msg, placeholder, onSubmit) {
    alertBox.innerHTML = `
      <div class="ios-alert-title">${escapeHtml(title)}</div>
      <div class="ios-alert-msg">${escapeHtml(msg)}</div>
      <input id="ia-single-input" type="text" placeholder="${escapeHtml(placeholder)}">
      <div class="ios-alert-buttons">
        <button id="ia-cancel">Cancel</button>
        <button id="ia-ok" class="bold">Save</button>
      </div>`;
    alertBackdrop.classList.add("show");
    const inp = document.getElementById("ia-single-input");
    setTimeout(() => inp.focus(), 80);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { alertBackdrop.classList.remove("show"); onSubmit(inp.value); } });
    document.getElementById("ia-cancel").onclick = () => alertBackdrop.classList.remove("show");
    document.getElementById("ia-ok").onclick = () => { alertBackdrop.classList.remove("show"); onSubmit(inp.value); };
  }

  function iosPromptFolder(onSubmit) {
    alertBox.innerHTML = `
      <div class="ios-alert-title">New Notebook</div>
      <div class="ios-alert-msg">Choose an icon and name for your folder</div>
      <input id="ia-emoji" type="text" placeholder="Emoji icon (e.g., 📐, 🌿)" maxlength="4" style="text-align:center;">
      <input id="ia-name" type="text" placeholder="Notebook Name">
      <div class="ios-alert-buttons">
        <button id="ia-cancel">Cancel</button>
        <button id="ia-ok" class="bold">Create</button>
      </div>`;
    alertBackdrop.classList.add("show");
    const nameInp = document.getElementById("ia-name");
    setTimeout(() => nameInp.focus(), 80);
    nameInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const emoji = document.getElementById("ia-emoji").value.trim(); const name = nameInp.value.trim();
        alertBackdrop.classList.remove("show"); onSubmit(name, emoji);
      }
    });
    document.getElementById("ia-cancel").onclick = () => alertBackdrop.classList.remove("show");
    document.getElementById("ia-ok").onclick = () => {
      const emoji = document.getElementById("ia-emoji").value.trim(); const name = nameInp.value.trim();
      alertBackdrop.classList.remove("show"); onSubmit(name, emoji);
    };
  }

  loadState();
})();
