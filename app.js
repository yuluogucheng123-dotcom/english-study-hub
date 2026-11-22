const STORAGE_KEY = "lexicon_atelier_state_v1";

const appState = {
  catalog: [],
  currentEntry: null,
  currentData: null,
  genre: "all",
  search: "",
  sort: "date-desc",
  onlyBookmarked: false,
  vocabFilter: "all",
  vocabSearch: "",
  maskMeaning: false,
  fcDeckMode: "all",
  fcDeck: [],
  fcIndex: 0,
  user: loadUserState(),
};

function loadUserState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        theme: parsed.theme || "light",
        bookmarks: parsed.bookmarks || {},
        vocabStatus: parsed.vocabStatus || {}, // key: `${entryId}::${wordId}` -> { mastered, review, star }
      };
    }
  } catch (e) {
    console.warn("Failed to parse saved state:", e);
  }
  return { theme: "light", bookmarks: {}, vocabStatus: {} };
}

function saveUserState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.user));
  updateGlobalStats();
}

function getWordState(entryId, wordId) {
  return appState.user.vocabStatus[`${entryId}::${wordId}`] || { mastered: false, review: false, star: false };
}

function setWordState(entryId, wordId, patch) {
  const key = `${entryId}::${wordId}`;
  const prev = getWordState(entryId, wordId);
  appState.user.vocabStatus[key] = { ...prev, ...patch };
  saveUserState();
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function speakWord(text, lang = "en-US") {
  if (!("speechSynthesis" in window)) {
    showToast("当前浏览器不支持语音朗读");
    return;
  }
  const clean = text.split("/")[0].replace(/\(.*?\)/g, "").trim();
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = lang;
  utter.rate = 0.92;
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
  if (match) utter.voice = match;
  window.speechSynthesis.speak(utter);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("btn-theme").textContent = theme === "dark" ? "☀️" : "🌙";
  appState.user.theme = theme;
  saveUserState();
}

function getEntryMastery(entry) {
  let mastered = 0;
  for (let i = 1; i <= entry.vocabCount; i++) {
    if (getWordState(entry.id, i).mastered) mastered++;
  }
  const pct = entry.vocabCount ? Math.round((mastered / entry.vocabCount) * 100) : 0;
  return { mastered, total: entry.vocabCount, pct };
}

function updateGlobalStats() {
  const totalDocs = appState.catalog.length;
  const totalVocab = appState.catalog.reduce((acc, e) => acc + (e.vocabCount || 0), 0);
  const totalMastered = appState.catalog.reduce((acc, e) => acc + getEntryMastery(e).mastered, 0);
  const rate = totalVocab ? Math.round((totalMastered / totalVocab) * 100) : 0;

  document.getElementById("stat-docs").textContent = totalDocs;
  document.getElementById("stat-vocab").textContent = totalVocab;
  document.getElementById("stat-mastered").textContent = totalMastered;
  document.getElementById("stat-rate").textContent = `${rate}%`;
}

function renderCatalog() {
  const grid = document.getElementById("catalog-grid");
  const empty = document.getElementById("catalog-empty");
  const q = appState.search.trim().toLowerCase();

  let items = appState.catalog.filter((e) => {
    if (appState.genre !== "all" && e.genre !== appState.genre) return false;
    if (appState.onlyBookmarked && !appState.user.bookmarks[e.id]) return false;
    if (q) {
      const hay = [e.title, e.subtitle, e.genre, ...(e.tags || []), ...(e.keywords || [])]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  items.sort((a, b) => {
    if (appState.sort === "date-desc") return (b.date || "").localeCompare(a.date || "");
    if (appState.sort === "date-asc") return (a.date || "").localeCompare(b.date || "");
    if (appState.sort === "vocab-desc") return (b.vocabCount || 0) - (a.vocabCount || 0);
    if (appState.sort === "mastery-asc") return getEntryMastery(a).pct - getEntryMastery(b).pct;
    return 0;
  });

  if (!items.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  grid.innerHTML = items
    .map((e) => {
      const m = getEntryMastery(e);
      const isBookmarked = !!appState.user.bookmarks[e.id];
      return `
      <article class="doc-card" data-id="${e.id}">
        <div class="card-top">
          <span class="badge genre-badge">${e.genre}</span>
          <span class="card-date">📅 ${e.date} · Day ${e.day || 1}</span>
        </div>
        <h3 class="card-title" data-open="${e.id}">${e.title}</h3>
        <p class="card-summary">${e.summary || ""}</p>
        <div class="card-metrics">
          <span>📝 ${e.wordCount} 词</span>
          <span>🔤 ${e.vocabCount} 考点词</span>
          <span>🧩 ${e.sentenceCount} 长难句</span>
        </div>
        <div class="progress-wrap">
          <div class="progress-label">
            <span>词汇掌握进度</span>
            <strong>${m.mastered} / ${m.total} (${m.pct}%)</strong>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${m.pct}%"></div></div>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary" data-open="${e.id}">进入精读工作台</button>
          <a class="btn btn-outline" href="${e.pdfPath}" download title="下载 PDF">⬇</a>
          <button class="btn btn-outline ${isBookmarked ? "active" : ""}" data-bookmark="${e.id}" title="收藏讲义">⭐</button>
        </div>
      </article>`;
    })
    .join("");
}

async function openWorkspace(entryId) {
  const entry = appState.catalog.find((e) => e.id === entryId);
  if (!entry) return;

  try {
    const res = await fetch(entry.dataPath);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    appState.currentEntry = entry;
    appState.currentData = data;
    appState.vocabFilter = "all";
    appState.vocabSearch = "";
    document.getElementById("vocab-search").value = "";

    document.getElementById("ws-genre").textContent = entry.genre;
    document.getElementById("ws-title").textContent = entry.title;
    document.getElementById("ws-meta").textContent = `Day ${entry.day || 1} · ${entry.date} · ${entry.wordCount} 词`;
    document.getElementById("tab-vocab-count").textContent = data.vocab.length;
    document.getElementById("tab-sent-count").textContent = data.sentences.length;

    document.getElementById("pdf-frame").src = entry.pdfPath;
    document.getElementById("btn-open-pdf").href = entry.pdfPath;
    document.getElementById("btn-download-pdf").href = entry.pdfPath;

    document.getElementById("catalog-view").classList.add("hidden");
    document.getElementById("workspace-view").classList.remove("hidden");

    renderVocabList();
    renderSentencesList();
    rebuildFlashcardDeck();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    showToast("加载讲义数据失败，请确认使用 HTTP/GitHub Pages 访问");
    console.error(err);
  }
}

function closeWorkspace() {
  document.getElementById("workspace-view").classList.add("hidden");
  document.getElementById("catalog-view").classList.remove("hidden");
  document.getElementById("pdf-frame").src = "about:blank";
  renderCatalog();
}

function renderVocabList() {
  if (!appState.currentData) return;
  const entryId = appState.currentEntry.id;
  const q = appState.vocabSearch.trim().toLowerCase();
  const listEl = document.getElementById("vocab-list");

  const filtered = appState.currentData.vocab.filter((v) => {
    const st = getWordState(entryId, v.id);
    if (appState.vocabFilter === "cet6" && v.type !== "cet6") return false;
    if (appState.vocabFilter === "ielts" && v.type !== "ielts") return false;
    if (appState.vocabFilter === "unmastered" && st.mastered) return false;
    if (appState.vocabFilter === "review" && !st.review) return false;
    if (appState.vocabFilter === "star" && !st.star) return false;
    if (q) {
      const hay = `${v.word} ${v.match} ${v.meaning} ${v.collocations}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state"><p>当前筛选条件下没有匹配的词汇。</p></div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((v) => {
      const st = getWordState(entryId, v.id);
      const tagClass = v.type === "cet6" ? "tag-cet6" : "tag-ielts";
      const tagLabel = v.type === "cet6" ? "CET-6" : "IELTS";
      const cardClass = st.mastered ? "is-mastered" : st.review ? "is-review" : "";
      const maskClass = appState.maskMeaning ? "masked" : "";
      return `
      <div class="vocab-card ${cardClass}" data-wid="${v.id}">
        <div class="vc-head">
          <div class="vc-title-group">
            <span class="vc-id">#${v.id}</span>
            <span class="vc-word">${v.word}</span>
            <span class="vc-phonetic">${v.phonetic}</span>
            <span class="${tagClass}">${tagLabel}</span>
          </div>
          <div class="vc-tts">
            <button class="tts-btn" data-speak="${v.match}" data-lang="en-GB" title="英音朗读">🇬🇧</button>
            <button class="tts-btn" data-speak="${v.match}" data-lang="en-US" title="美音朗读">🇺🇸</button>
          </div>
        </div>
        <div class="vc-body">
          <div class="vc-meaning ${maskClass}" onclick="this.classList.toggle('masked')">${v.meaning}</div>
          <div class="vc-colloc">${v.collocations}</div>
          <div class="vc-sent">${v.sentence}</div>
        </div>
        <div class="vc-actions">
          <button class="state-btn ${st.mastered ? "active-mastered" : ""}" data-act="mastered" data-wid="${v.id}">✅ 已掌握</button>
          <button class="state-btn ${st.review ? "active-review" : ""}" data-act="review" data-wid="${v.id}">🔖 需复习</button>
          <button class="state-btn ${st.star ? "active-star" : ""}" data-act="star" data-wid="${v.id}">⭐ 收藏</button>
        </div>
      </div>`;
    })
    .join("");
}

function renderSentencesList() {
  if (!appState.currentData) return;
  const listEl = document.getElementById("sentences-list");
  listEl.innerHTML = appState.currentData.sentences
    .map(
      (s) => `
      <div class="sent-card">
        <div class="vc-head">
          <strong class="sent-label">长难句精析 #${s.id}</strong>
          <button class="btn btn-sm btn-outline" data-copy-sent="${s.id}">📋 复制仿写模板</button>
        </div>
        <div class="sent-orig">${s.original}</div>
        <div class="sent-block"><span class="sent-label">主干提取：</span>${s.backbone}</div>
        <div class="sent-block"><span class="sent-label">语法拆解：</span><br>${s.grammar}</div>
        <div class="sent-template">${s.template}</div>
      </div>`
    )
    .join("");
}

function rebuildFlashcardDeck() {
  if (!appState.currentData) return;
  const entryId = appState.currentEntry.id;
  const all = appState.currentData.vocab;
  appState.fcDeck =
    appState.fcDeckMode === "unmastered"
      ? all.filter((v) => {
          const st = getWordState(entryId, v.id);
          return !st.mastered || st.review;
        })
      : [...all];
  appState.fcIndex = 0;
  renderFlashcard();
}

function renderFlashcard() {
  const card = document.getElementById("flashcard");
  card.classList.remove("flipped");
  const counter = document.getElementById("fc-counter");
  if (!appState.fcDeck.length) {
    counter.textContent = "0 / 0";
    document.getElementById("fc-word").textContent = "🎉 全部已掌握！";
    document.getElementById("fc-phonetic").textContent = "可切换回“本篇全部词”继续巩固";
    document.getElementById("fc-front-tags").innerHTML = "";
    return;
  }
  const v = appState.fcDeck[appState.fcIndex];
  counter.textContent = `${appState.fcIndex + 1} / ${appState.fcDeck.length}`;
  const tagClass = v.type === "cet6" ? "tag-cet6" : "tag-ielts";
  document.getElementById("fc-front-tags").innerHTML = `<span class="${tagClass}">${v.type.toUpperCase()}</span>`;
  document.getElementById("fc-word").textContent = v.word;
  document.getElementById("fc-phonetic").textContent = v.phonetic;
  document.getElementById("fc-back-word").textContent = `${v.word}  ${v.phonetic}`;
  document.getElementById("fc-meaning").innerHTML = v.meaning;
  document.getElementById("fc-colloc").innerHTML = v.collocations;
  document.getElementById("fc-sentence").innerHTML = v.sentence;
}

function bindEvents() {
  document.getElementById("brand-home").addEventListener("click", closeWorkspace);
  document.getElementById("btn-back").addEventListener("click", closeWorkspace);
  document.getElementById("btn-theme").addEventListener("click", () => {
    applyTheme(appState.user.theme === "dark" ? "light" : "dark");
  });

  // Genre tabs
  document.getElementById("genre-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".genre-pill");
    if (!btn) return;
    document.querySelectorAll(".genre-pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    appState.genre = btn.dataset.genre;
    renderCatalog();
  });

  document.getElementById("search-input").addEventListener("input", (e) => {
    appState.search = e.target.value;
    renderCatalog();
  });

  document.getElementById("sort-select").addEventListener("change", (e) => {
    appState.sort = e.target.value;
    renderCatalog();
  });

  document.getElementById("btn-only-bookmarked").addEventListener("click", (e) => {
    appState.onlyBookmarked = !appState.onlyBookmarked;
    e.currentTarget.classList.toggle("active", appState.onlyBookmarked);
    renderCatalog();
  });

  // Catalog clicks
  document.getElementById("catalog-grid").addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) {
      openWorkspace(openBtn.dataset.open);
      return;
    }
    const bmBtn = e.target.closest("[data-bookmark]");
    if (bmBtn) {
      const id = bmBtn.dataset.bookmark;
      appState.user.bookmarks[id] = !appState.user.bookmarks[id];
      saveUserState();
      renderCatalog();
      showToast(appState.user.bookmarks[id] ? "已加入收藏夹 ⭐" : "已取消收藏");
    }
  });

  // Workspace controls
  document.getElementById("btn-toggle-pdf").addEventListener("click", () => {
    document.getElementById("workspace-body").classList.toggle("study-only");
  });

  document.querySelector(".study-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".study-tab");
    if (!tab) return;
    document.querySelectorAll(".study-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });

  // Vocab filters & actions
  document.getElementById("vocab-filters").addEventListener("click", (e) => {
    const pill = e.target.closest(".mini-pill");
    if (!pill) return;
    document.querySelectorAll("#vocab-filters .mini-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    appState.vocabFilter = pill.dataset.filter;
    renderVocabList();
  });

  document.getElementById("vocab-search").addEventListener("input", (e) => {
    appState.vocabSearch = e.target.value;
    renderVocabList();
  });

  document.getElementById("btn-mask-meaning").addEventListener("click", (e) => {
    appState.maskMeaning = !appState.maskMeaning;
    e.currentTarget.classList.toggle("active", appState.maskMeaning);
    e.currentTarget.textContent = appState.maskMeaning ? "👁️ 显示全部释义" : "👁️ 隐藏释义";
    renderVocabList();
  });

  document.getElementById("vocab-list").addEventListener("click", (e) => {
    const tts = e.target.closest("[data-speak]");
    if (tts) {
      speakWord(tts.dataset.speak, tts.dataset.lang);
      return;
    }
    const actBtn = e.target.closest("[data-act]");
    if (actBtn && appState.currentEntry) {
      const wid = Number(actBtn.dataset.wid);
      const act = actBtn.dataset.act;
      const cur = getWordState(appState.currentEntry.id, wid);
      if (act === "mastered") {
        setWordState(appState.currentEntry.id, wid, { mastered: !cur.mastered, review: false });
      } else if (act === "review") {
        setWordState(appState.currentEntry.id, wid, { review: !cur.review, mastered: false });
      } else if (act === "star") {
        setWordState(appState.currentEntry.id, wid, { star: !cur.star });
      }
      renderVocabList();
    }
  });

  // Copy sentence template
  document.getElementById("sentences-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy-sent]");
    if (!btn || !appState.currentData) return;
    const s = appState.currentData.sentences.find((x) => String(x.id) === btn.dataset.copySent);
    if (!s) return;
    const plain = s.template.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
    try {
      await navigator.clipboard.writeText(plain);
      showToast("写作仿写模板已复制到剪贴板 📋");
    } catch {
      showToast("复制失败，请手动选中复制");
    }
  });

  // Flashcards
  document.querySelector(".fc-deck-switch").addEventListener("click", (e) => {
    const btn = e.target.closest(".mini-pill");
    if (!btn) return;
    document.querySelectorAll(".fc-deck-switch .mini-pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    appState.fcDeckMode = btn.dataset.deck;
    rebuildFlashcardDeck();
  });

  document.getElementById("flashcard").addEventListener("click", (e) => {
    const tts = e.target.closest(".fc-tts-btn");
    if (tts) {
      e.stopPropagation();
      const v = appState.fcDeck[appState.fcIndex];
      if (v) speakWord(v.match, tts.dataset.accent);
      return;
    }
    document.getElementById("flashcard").classList.toggle("flipped");
  });

  document.getElementById("fc-prev").addEventListener("click", () => {
    if (!appState.fcDeck.length) return;
    appState.fcIndex = (appState.fcIndex - 1 + appState.fcDeck.length) % appState.fcDeck.length;
    renderFlashcard();
  });

  document.getElementById("fc-next").addEventListener("click", () => {
    if (!appState.fcDeck.length) return;
    appState.fcIndex = (appState.fcIndex + 1) % appState.fcDeck.length;
    renderFlashcard();
  });

  document.getElementById("fc-shuffle").addEventListener("click", () => {
    for (let i = appState.fcDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [appState.fcDeck[i], appState.fcDeck[j]] = [appState.fcDeck[j], appState.fcDeck[i]];
    }
    appState.fcIndex = 0;
    renderFlashcard();
    showToast("闪卡顺序已随机打乱 🔀");
  });

  document.getElementById("fc-mark-mastered").addEventListener("click", () => {
    const v = appState.fcDeck[appState.fcIndex];
    if (!v || !appState.currentEntry) return;
    setWordState(appState.currentEntry.id, v.id, { mastered: true, review: false });
    showToast(`已标记「${v.match}」为已掌握 ✅`);
    appState.fcIndex = (appState.fcIndex + 1) % appState.fcDeck.length;
    renderFlashcard();
    renderVocabList();
  });

  document.getElementById("fc-mark-review").addEventListener("click", () => {
    const v = appState.fcDeck[appState.fcIndex];
    if (!v || !appState.currentEntry) return;
    setWordState(appState.currentEntry.id, v.id, { mastered: false, review: true });
    showToast(`已加入「${v.match}」到需复习 🔖`);
    appState.fcIndex = (appState.fcIndex + 1) % appState.fcDeck.length;
    renderFlashcard();
    renderVocabList();
  });

  // Keyboard shortcut for flashcard
  document.addEventListener("keydown", (e) => {
    const panel = document.getElementById("panel-flashcards");
    if (!panel.classList.contains("active") || e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      document.getElementById("flashcard").classList.toggle("flipped");
    } else if (e.code === "ArrowRight") {
      document.getElementById("fc-next").click();
    } else if (e.code === "ArrowLeft") {
      document.getElementById("fc-prev").click();
    }
  });

  // Export / Import JSON progress
  document.getElementById("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(appState.user, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lexicon-atelier-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast("学习进度 JSON 已导出 ⬇");
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });

  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      appState.user = {
        theme: data.theme || appState.user.theme,
        bookmarks: data.bookmarks || {},
        vocabStatus: data.vocabStatus || {},
      };
      saveUserState();
      applyTheme(appState.user.theme);
      renderCatalog();
      if (appState.currentData) renderVocabList();
      showToast("学习进度已恢复 ⬆");
    } catch {
      showToast("无效的进度 JSON 文件");
    }
    e.target.value = "";
  });
}

async function init() {
  applyTheme(appState.user.theme);
  bindEvents();
  try {
    const res = await fetch("data/catalog.json");
    appState.catalog = await res.json();
    updateGlobalStats();
    renderCatalog();
  } catch (err) {
    console.error("Failed to load catalog.json:", err);
    showToast("无法加载 catalog.json");
  }
}

init();
