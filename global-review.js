// Lexicon Atelier v2 — Global Vocabulary Review Drawer & NotebookLM Markdown Exporter
(function () {
  const entryCache = {};
  const grState = {
    allItems: [],
    deck: [],
    index: 0,
    filter: "all",
    isOpen: false,
  };

  function stripHtml(html) {
    return String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?b>/gi, "**")
      .replace(/<\/?code>/gi, "`")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  async function fetchEntryData(entry) {
    if (entryCache[entry.id]) return entryCache[entry.id];
    const res = await fetch(entry.dataPath);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    entryCache[entry.id] = data;
    return data;
  }

  async function exportEntryMarkdown(entry, getWordStateFn, showToastFn) {
    try {
      const data = await fetchEntryData(entry);
      const lines = [];
      lines.push(`# ${data.title || entry.title}`);
      lines.push("");
      const meta = [
        `题材：${entry.genre}`,
        entry.sourceLabel || data.sourceLabel ? `来源：${entry.sourceLabel || data.sourceLabel}` : "",
        `日期：${entry.date || ""} (Day ${entry.day || 1})`,
        `词数：${entry.wordCount || data.wordCount || 0}`,
      ].filter(Boolean);
      lines.push(`> ${meta.join(" | ")}`);
      lines.push("");

      if (Array.isArray(data.paragraphs) && data.paragraphs.length) {
        lines.push("## 一、英文原文");
        lines.push("");
        data.paragraphs.forEach((p) => {
          lines.push(p);
          lines.push("");
        });
      }

      if (Array.isArray(data.sentences) && data.sentences.length) {
        lines.push("## 二、长难句精析与写作模板");
        lines.push("");
        data.sentences.forEach((s) => {
          lines.push(`### 句 ${s.id}`);
          lines.push(`- **英文原句**：${s.original}`);
          if (s.zhTranslation) lines.push(`- **中文参考译文**：${s.zhTranslation}`);
          if (s.backbone) lines.push(`- **主干提取**：${stripHtml(s.backbone)}`);
          if (s.grammar) lines.push(`- **语法拆解**：\n${stripHtml(s.grammar)}`);
          if (s.template) lines.push(`- **写作模板**：\n${stripHtml(s.template)}`);
          lines.push("");
        });
      }

      if (Array.isArray(data.vocab) && data.vocab.length) {
        lines.push("## 三、核心考点词汇表");
        lines.push("");
        lines.push("| # | 词汇 | 音标 | 分级 | 释义 | 搭配与同义替换 | 掌握状态 |");
        lines.push("| :-: | :--- | :--- | :-: | :--- | :--- | :-: |");
        data.vocab.forEach((v) => {
          const st = getWordStateFn(entry.id, v.id);
          const status = st.mastered ? "✅ 已掌握" : st.review ? "🔖 需复习" : "⬜ 未掌握";
          const clean = (s) => stripHtml(s).replace(/\n+/g, "；").replace(/\|/g, "\\|");
          lines.push(
            `| ${v.id} | ${clean(v.word)} | ${clean(v.phonetic)} | ${(v.type || "").toUpperCase()} | ${clean(v.meaning)} | ${clean(v.collocations)} | ${status} |`
          );
        });
        lines.push("");
      }

      const md = lines.join("\n");
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const safeName = (entry.id || "study-notes").replace(/[^a-zA-Z0-9_-]/g, "_");
      a.download = `${safeName}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      showToastFn("已导出 Markdown 讲义与词表（可直接导入 NotebookLM）⬇");
    } catch (err) {
      console.error(err);
      showToastFn("导出 Markdown 失败，请稍后重试");
    }
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function applyGlobalFilter() {
    const { filter, allItems } = grState;
    grState.deck = allItems.filter((item) => {
      if (filter === "review") return item.state.review;
      if (filter === "cet6") return item.vocab.type === "cet6";
      if (filter === "ielts") return item.vocab.type === "ielts";
      return true;
    });
    shuffleArray(grState.deck);
    grState.index = 0;
    renderGlobalCard();
  }

  function renderGlobalCard() {
    const stageWrap = document.getElementById("gr-stage-wrap");
    const emptyEl = document.getElementById("gr-empty");
    const counter = document.getElementById("gr-counter");
    const card = document.getElementById("gr-flashcard");
    card.classList.remove("flipped");

    if (!grState.deck.length) {
      counter.textContent = "0 / 0";
      stageWrap.classList.add("hidden");
      emptyEl.classList.remove("hidden");
      return;
    }

    emptyEl.classList.add("hidden");
    stageWrap.classList.remove("hidden");
    const item = grState.deck[grState.index];
    const v = item.vocab;

    counter.textContent = `${grState.index + 1} / ${grState.deck.length}`;
    document.getElementById("gr-source-tag").textContent = `📄 ${item.entryTitle} (Day ${item.day || 1})`;
    const tagClass = v.type === "cet6" ? "tag-cet6" : "tag-ielts";
    const revTag = item.state.review ? `<span class="mini-tag tag-cet6">🔖 需复习</span>` : "";
    document.getElementById("gr-front-tags").innerHTML = `<span class="${tagClass}">${(v.type || "").toUpperCase()}</span> ${revTag}`;
    document.getElementById("gr-word").textContent = v.word;
    document.getElementById("gr-phonetic").textContent = v.phonetic || "";
    document.getElementById("gr-back-word").textContent = `${v.word}  ${v.phonetic || ""}`;
    document.getElementById("gr-meaning").innerHTML = v.meaning || "";
    document.getElementById("gr-colloc").innerHTML = v.collocations || "";
    document.getElementById("gr-sentence").innerHTML = v.sentence || "";
  }

  async function openGlobalReview(catalog, getWordStateFn) {
    const overlay = document.getElementById("global-review-overlay");
    const infoEl = document.getElementById("gr-count-info");
    overlay.classList.remove("hidden");
    grState.isOpen = true;
    infoEl.textContent = "正在汇总所有讲义中的未掌握与需复习词汇...";

    const results = await Promise.all(
      catalog.map(async (entry) => {
        try {
          const data = await fetchEntryData(entry);
          return { entry, data };
        } catch {
          return null;
        }
      })
    );

    const collected = [];
    results.forEach((res) => {
      if (!res || !Array.isArray(res.data.vocab)) return;
      res.data.vocab.forEach((v) => {
        const st = getWordStateFn(res.entry.id, v.id);
        if (!st.mastered || st.review) {
          collected.push({
            entryId: res.entry.id,
            entryTitle: res.entry.title,
            day: res.entry.day,
            vocab: v,
            state: st,
          });
        }
      });
    });

    grState.allItems = collected;
    infoEl.textContent = `共汇总 ${catalog.length} 篇讲义，待复习 / 未掌握词汇 ${collected.length} 个`;
    applyGlobalFilter();
  }

  function closeGlobalReview() {
    document.getElementById("global-review-overlay").classList.add("hidden");
    grState.isOpen = false;
  }

  function initGlobalReviewBindings(api) {
    document.getElementById("btn-close-global-review")?.addEventListener("click", closeGlobalReview);
    document.getElementById("global-review-overlay")?.addEventListener("click", (e) => {
      if (e.target.id === "global-review-overlay") closeGlobalReview();
    });

    document.getElementById("gr-filters")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-gr-filter]");
      if (!btn) return;
      document.querySelectorAll("#gr-filters .mini-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      grState.filter = btn.dataset.grFilter;
      applyGlobalFilter();
    });

    document.getElementById("gr-flashcard")?.addEventListener("click", (e) => {
      const tts = e.target.closest(".gr-tts-btn");
      if (tts) {
        e.stopPropagation();
        const cur = grState.deck[grState.index];
        if (cur) api.speakWord(cur.vocab.match || cur.vocab.word, tts.dataset.accent);
        return;
      }
      document.getElementById("gr-flashcard").classList.toggle("flipped");
    });

    document.getElementById("gr-prev")?.addEventListener("click", () => {
      if (!grState.deck.length) return;
      grState.index = (grState.index - 1 + grState.deck.length) % grState.deck.length;
      renderGlobalCard();
    });

    document.getElementById("gr-next")?.addEventListener("click", () => {
      if (!grState.deck.length) return;
      grState.index = (grState.index + 1) % grState.deck.length;
      renderGlobalCard();
    });

    document.getElementById("gr-shuffle")?.addEventListener("click", () => {
      shuffleArray(grState.deck);
      grState.index = 0;
      renderGlobalCard();
      api.showToast("全局闪卡已随机打乱 🔀");
    });

    document.getElementById("gr-mark-mastered")?.addEventListener("click", () => {
      const cur = grState.deck[grState.index];
      if (!cur) return;
      api.setWordState(cur.entryId, cur.vocab.id, { mastered: true, review: false });
      api.showToast(`已掌握「${cur.vocab.match || cur.vocab.word}」✅`);
      grState.allItems = grState.allItems.filter(
        (x) => !(x.entryId === cur.entryId && x.vocab.id === cur.vocab.id)
      );
      grState.deck.splice(grState.index, 1);
      if (grState.index >= grState.deck.length) grState.index = 0;
      document.getElementById("gr-count-info").textContent = `当前待复习 / 未掌握词汇 ${grState.allItems.length} 个`;
      renderGlobalCard();
      api.onProgressChange();
    });

    document.getElementById("gr-mark-review")?.addEventListener("click", () => {
      const cur = grState.deck[grState.index];
      if (!cur) return;
      api.setWordState(cur.entryId, cur.vocab.id, { mastered: false, review: true });
      cur.state = { ...cur.state, mastered: false, review: true };
      api.showToast(`已标记「${cur.vocab.match || cur.vocab.word}」仍需复习 🔖`);
      grState.index = (grState.index + 1) % grState.deck.length;
      renderGlobalCard();
      api.onProgressChange();
    });
  }

  window.GlobalReview = {
    open: openGlobalReview,
    close: closeGlobalReview,
    isOpen: () => grState.isOpen,
    exportEntryMarkdown,
    initBindings: initGlobalReviewBindings,
  };
})();
