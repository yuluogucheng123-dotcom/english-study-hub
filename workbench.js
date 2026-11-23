// Lexicon Atelier v2 — Native Interactive HTML Reader, Hover Tooltip, Bidirectional Sync & Paragraph TTS
(function () {
  const wbState = {
    entry: null,
    data: null,
    pdfMode: false,
    speakingParaIdx: null,
    isPaused: false,
    hideTimer: null,
    currentHoverId: null,
    onWordSelect: null,
    speakFn: null,
  };

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function splitSentences(paragraph) {
    // Preserve exact text while wrapping sentences for right->left sentence highlighting
    const parts = paragraph.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g);
    return parts && parts.length ? parts : [paragraph];
  }

  function highlightTextWithVocab(rawText, vocabList, matchedIds) {
    let safe = escapeHtml(rawText);
    // Preserve markdown italics like *Homo sapiens*
    safe = safe.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // Protect existing HTML tags with placeholders
    const tokens = [];
    const stash = (html) => {
      const key = `@@TOK_${tokens.length}@@`;
      tokens.push(html);
      return key;
    };

    safe = safe.replace(/<[^>]+>/g, (tag) => stash(tag));

    // Match longest phrases first so multi-word idioms win over single words
    const ordered = [...vocabList].sort((a, b) => (b.match || "").length - (a.match || "").length);

    for (const item of ordered) {
      if (!item.match || matchedIds.has(item.id)) continue;
      const pattern = new RegExp(`\\b(${escapeRegex(item.match)})\\b`, "i");
      if (pattern.test(safe)) {
        matchedIds.add(item.id);
        const cls = item.recurring
          ? "hl-recur"
          : item.type === "cet6"
          ? "hl-cet6"
          : "hl-ielts";
        safe = safe.replace(pattern, (m) =>
          stash(
            `<mark class="hl-word ${cls}" data-word-id="${item.id}" tabindex="0">${m}<sup class="hl-sup">[${item.id}]</sup></mark>`
          )
        );
      }
    }

    // Restore placeholders (reverse order handles nested stashes cleanly)
    for (let i = tokens.length - 1; i >= 0; i--) {
      safe = safe.replace(`@@TOK_${i}@@`, () => tokens[i]);
    }
    return safe;
  }

  function renderNativeReader(entry, data, callbacks = {}) {
    wbState.entry = entry;
    wbState.data = data;
    wbState.onWordSelect = callbacks.onWordSelect || null;
    wbState.speakFn = callbacks.speakFn || null;

    stopParagraphTTS();
    setPdfMode(false);

    const headEl = document.getElementById("reader-article-head");
    const parasEl = document.getElementById("reader-paragraphs");

    const sourceTag = entry.sourceLabel || data.sourceLabel
      ? `<span class="badge source-badge">${escapeHtml(entry.sourceLabel || data.sourceLabel)}</span>`
      : "";

    headEl.innerHTML = `
      <h1 class="reader-article-title">${escapeHtml(data.title || entry.title)}</h1>
      <div class="reader-article-meta">
        <span>📅 ${escapeHtml(entry.date || "")} · Day ${entry.day || 1}</span>
        <span>📝 ${entry.wordCount || data.wordCount || 0} 词</span>
        <span>🔤 ${(data.vocab || []).length} 个考点词</span>
        ${sourceTag}
      </div>
    `;

    const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
    const vocabList = Array.isArray(data.vocab) ? data.vocab : [];
    const matchedIds = new Set();

    if (!paragraphs.length) {
      parasEl.innerHTML = `<p style="color:var(--text-muted)">本篇暂无原生正文文本，请点击右上角「切换原版 PDF 预览」阅读。</p>`;
      return;
    }

    parasEl.innerHTML = paragraphs
      .map((para, idx) => {
        const sentences = splitSentences(para);
        const htmlSentences = sentences
          .map(
            (s, sIdx) =>
              `<span class="reading-sent" data-para-idx="${idx}" data-sent-idx="${sIdx}">${highlightTextWithVocab(
                s,
                vocabList,
                matchedIds
              )}</span>`
          )
          .join("");
        return `
          <section class="reader-para-block" data-para-idx="${idx}">
            <div class="para-head">
              <span class="para-index">Paragraph ${idx + 1}</span>
              <button class="para-tts-btn" type="button" data-para-tts="${idx}">🔊 朗读本段</button>
            </div>
            <p class="reader-para-text">${htmlSentences}</p>
          </section>
        `;
      })
      .join("");
  }

  function setPdfMode(enablePdf) {
    wbState.pdfMode = !!enablePdf;
    const nativeEl = document.getElementById("native-reader");
    const pdfWrap = document.getElementById("pdf-reader-wrap");
    const toggleBtn = document.getElementById("btn-toggle-pdf-mode");
    const iframe = document.getElementById("pdf-frame");

    if (wbState.pdfMode) {
      stopParagraphTTS();
      hideTooltip(true);
      if (wbState.entry && iframe.getAttribute("data-loaded-src") !== wbState.entry.pdfPath) {
        iframe.src = wbState.entry.pdfPath;
        iframe.setAttribute("data-loaded-src", wbState.entry.pdfPath);
      }
      nativeEl.classList.add("hidden");
      pdfWrap.classList.remove("hidden");
      toggleBtn.textContent = "📖 返回原生互动正文";
    } else {
      pdfWrap.classList.add("hidden");
      nativeEl.classList.remove("hidden");
      toggleBtn.textContent = "📄 切换原版 PDF 预览";
    }
  }

  function updateParaTtsButtons() {
    document.querySelectorAll(".reader-para-block").forEach((block) => {
      const idx = Number(block.dataset.paraIdx);
      const btn = block.querySelector(".para-tts-btn");
      if (!btn) return;
      if (wbState.speakingParaIdx === idx) {
        block.classList.add("is-speaking");
        btn.classList.add("speaking");
        btn.textContent = wbState.isPaused ? "▶ 继续朗读" : "⏸ 暂停朗读";
      } else {
        block.classList.remove("is-speaking");
        btn.classList.remove("speaking");
        btn.textContent = "🔊 朗读本段";
      }
    });
    const stopBtn = document.getElementById("btn-stop-tts");
    if (stopBtn) {
      stopBtn.classList.toggle("hidden", wbState.speakingParaIdx === null);
    }
  }

  function stopParagraphTTS() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    wbState.speakingParaIdx = null;
    wbState.isPaused = false;
    updateParaTtsButtons();
  }

  function toggleParagraphTTS(paraIdx) {
    if (!("speechSynthesis" in window)) {
      if (window.showToast) window.showToast("当前浏览器不支持语音朗读");
      return;
    }
    const paragraphs = (wbState.data && wbState.data.paragraphs) || [];
    const rawText = paragraphs[paraIdx];
    if (!rawText) return;

    if (wbState.speakingParaIdx === paraIdx) {
      if (wbState.isPaused) {
        window.speechSynthesis.resume();
        wbState.isPaused = false;
      } else {
        window.speechSynthesis.pause();
        wbState.isPaused = true;
      }
      updateParaTtsButtons();
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = rawText.replace(/\*/g, "").trim();
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = "en-US";
    utter.rate = 0.94;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang.toLowerCase().startsWith("en-us")) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("en"));
    if (preferred) utter.voice = preferred;

    wbState.speakingParaIdx = paraIdx;
    wbState.isPaused = false;
    updateParaTtsButtons();

    utter.onend = () => {
      if (wbState.speakingParaIdx === paraIdx) {
        wbState.speakingParaIdx = null;
        wbState.isPaused = false;
        updateParaTtsButtons();
      }
    };
    utter.onerror = () => {
      wbState.speakingParaIdx = null;
      wbState.isPaused = false;
      updateParaTtsButtons();
    };
    window.speechSynthesis.speak(utter);
  }

  function showTooltipForMark(markEl) {
    if (!wbState.data) return;
    const wordId = Number(markEl.dataset.wordId);
    const item = (wbState.data.vocab || []).find((v) => v.id === wordId);
    if (!item) return;

    clearTimeout(wbState.hideTimer);
    wbState.currentHoverId = wordId;

    const tip = document.getElementById("word-tooltip");
    document.getElementById("tt-word").textContent = item.word || item.match;
    const badge = document.getElementById("tt-badge");
    badge.textContent = item.type === "cet6" ? "CET-6" : "IELTS";
    badge.className = `mini-tag ${item.type === "cet6" ? "tag-cet6" : "tag-ielts"}`;
    document.getElementById("tt-phonetic").textContent = item.phonetic || "";
    document.getElementById("tt-meaning").innerHTML = item.meaning || "";

    tip.classList.remove("hidden");

    const rect = markEl.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tipRect.width - 12));
    let top = rect.top - tipRect.height - 10;
    if (top < 12) top = rect.bottom + 10;

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function hideTooltip(immediate = false) {
    clearTimeout(wbState.hideTimer);
    const tip = document.getElementById("word-tooltip");
    if (!tip) return;
    if (immediate) {
      tip.classList.add("hidden");
      wbState.currentHoverId = null;
      return;
    }
    wbState.hideTimer = setTimeout(() => {
      tip.classList.add("hidden");
      wbState.currentHoverId = null;
    }, 150);
  }

  function scrollToWordInReader(wordId) {
    if (wbState.pdfMode) setPdfMode(false);
    const mark = document.querySelector(`#reader-paragraphs .hl-word[data-word-id="${wordId}"]`);
    if (!mark) return false;

    document.querySelectorAll("#reader-paragraphs .hl-word.hl-active").forEach((el) =>
      el.classList.remove("hl-active")
    );
    document.querySelectorAll("#reader-paragraphs .reading-sent.sent-pulse").forEach((el) =>
      el.classList.remove("sent-pulse")
    );

    const sent = mark.closest(".reading-sent");
    (sent || mark).scrollIntoView({ behavior: "smooth", block: "center" });

    mark.classList.add("hl-active");
    if (sent) {
      void sent.offsetWidth;
      sent.classList.add("sent-pulse");
    }
    setTimeout(() => {
      mark.classList.remove("hl-active");
      if (sent) sent.classList.remove("sent-pulse");
    }, 1800);
    return true;
  }

  function bindWorkbenchEvents() {
    const parasEl = document.getElementById("reader-paragraphs");
    const tipEl = document.getElementById("word-tooltip");
    const togglePdfBtn = document.getElementById("btn-toggle-pdf-mode");
    const stopTtsBtn = document.getElementById("btn-stop-tts");

    if (togglePdfBtn) {
      togglePdfBtn.addEventListener("click", () => setPdfMode(!wbState.pdfMode));
    }
    if (stopTtsBtn) {
      stopTtsBtn.addEventListener("click", stopParagraphTTS);
    }

    if (parasEl) {
      parasEl.addEventListener("mouseover", (e) => {
        const mark = e.target.closest(".hl-word");
        if (mark) showTooltipForMark(mark);
      });
      parasEl.addEventListener("mouseout", (e) => {
        const mark = e.target.closest(".hl-word");
        if (mark) hideTooltip(false);
      });
      parasEl.addEventListener("click", (e) => {
        const ttsBtn = e.target.closest("[data-para-tts]");
        if (ttsBtn) {
          toggleParagraphTTS(Number(ttsBtn.dataset.paraTts));
          return;
        }
        const mark = e.target.closest(".hl-word");
        if (mark && wbState.onWordSelect) {
          hideTooltip(true);
          wbState.onWordSelect(Number(mark.dataset.wordId));
        }
      });
    }

    if (tipEl) {
      tipEl.addEventListener("mouseenter", () => clearTimeout(wbState.hideTimer));
      tipEl.addEventListener("mouseleave", () => hideTooltip(false));
      document.getElementById("tt-gb")?.addEventListener("click", () => {
        const item = (wbState.data?.vocab || []).find((v) => v.id === wbState.currentHoverId);
        if (item && wbState.speakFn) wbState.speakFn(item.word || item.match, "en-GB");
      });
      document.getElementById("tt-us")?.addEventListener("click", () => {
        const item = (wbState.data?.vocab || []).find((v) => v.id === wbState.currentHoverId);
        if (item && wbState.speakFn) wbState.speakFn(item.word || item.match, "en-US");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", bindWorkbenchEvents);

  window.Workbench = {
    renderNativeReader,
    setPdfMode,
    stopParagraphTTS,
    scrollToWordInReader,
    hideTooltip,
  };
})();
