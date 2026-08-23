(() => {
  "use strict";

  // Standard Persian/Arabic keyboard mapping for the English keys.
  const EN_TO_FA = {
    "q":"ض","w":"ص","e":"ث","r":"ق","t":"ف","y":"غ","u":"ع","i":"ه","o":"خ","p":"ح",
    "[":"ج","]":"چ","a":"ش","s":"س","d":"ی","f":"ب","g":"ل","h":"ا","j":"ت","k":"ن","l":"م",
    ";":"ک","'":"گ","z":"ظ","x":"ط","c":"ز","v":"ر","b":"ذ","n":"د","m":"پ",",":"و",".":"؟",
    "/":"٬","`":"پ"
  };

  const FA_TO_EN = Object.fromEntries(Object.entries(EN_TO_FA).map(([k,v]) => [v,k]));
  Object.assign(FA_TO_EN, {
    "آ":"\\", "ژ":"c", "ء":"x", "أ":"q", "إ":"w", "ؤ":"c", "ي":"d", "ى":"d"
  });

  const EN_LETTERS = /[A-Za-z]/;
  const FA_CHARS = /[\\u0600-\\u06FF]/;

  function swapCasePreserving(ch) {
    const lower = ch.toLowerCase();
    if (EN_TO_FA[lower]) return EN_TO_FA[lower];
    return ch;
  }

  function englishToPersian(text) {
    let out = "";
    for (const ch of text) {
      const lower = ch.toLowerCase();
      if (EN_TO_FA[lower]) {
        const mapped = EN_TO_FA[lower];
        out += mapped;
      } else {
        out += ch;
      }
    }
    return out;
  }

  function persianToEnglish(text) {
    let out = "";
    for (const ch of text) {
      out += FA_TO_EN[ch] ?? ch;
    }
    return out;
  }

  function score(text) {
    const chars = [...text];
    const letters = chars.filter(c => EN_LETTERS.test(c) || FA_CHARS.test(c));
    if (!letters.length) return { fa: 0, en: 0, total: 0 };

    const fa = letters.filter(c => FA_CHARS.test(c)).length;
    const en = letters.filter(c => EN_LETTERS.test(c)).length;
    return { fa, en, total: letters.length };
  }

  // Detect the classic mistakes:
  // 1) English-looking text whose keys strongly correspond to Persian words.
  // 2) Persian-looking text whose characters strongly correspond to English keys.
  function chooseConversion(text) {
    if (!text || text.trim().length < 2) return null;

    const s = score(text);
    const enCandidate = englishToPersian(text);
    const faCandidate = persianToEnglish(text);
    const enCandScore = score(enCandidate);
    const faCandScore = score(faCandidate);

    // Only convert if the result becomes substantially more language-like.
    if (s.en >= 2 && enCandScore.fa >= 2 && enCandScore.fa / Math.max(1, enCandScore.total) >= 0.45) {
      return { text: enCandidate, reason: "en-to-fa" };
    }

    if (s.fa >= 2 && faCandScore.en >= 2 && faCandScore.en / Math.max(1, faCandScore.total) >= 0.45) {
      return { text: faCandidate, reason: "fa-to-en" };
    }

    return null;
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      return ["text", "search", "url", "email", "tel"].includes((el.type || "text").toLowerCase());
    }
    return el.isContentEditable === true;
  }

  function replaceSelection(el, replacement) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.setRangeText(replacement, start, end, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return false;
    range.deleteContents();
    range.insertNode(document.createTextNode(replacement));
    sel.collapseToEnd();
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacement }));
    return true;
  }

  function replaceWholeEditable(el, replacement) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.select();
      el.setRangeText(replacement, 0, el.value.length, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      try { el.setSelectionRange(start, end); } catch (_) {}
      return true;
    }

    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    range.deleteContents();
    range.insertNode(document.createTextNode(replacement));
    sel.collapseToEnd();
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacement }));
    return true;
  }

  function getSelectedText() {
    const sel = window.getSelection();
    return sel && sel.rangeCount ? sel.toString() : "";
  }

  function fixCurrent() {
    const active = document.activeElement;
    const selected = getSelectedText();

    // Prefer an explicit selection.
    if (selected.trim().length >= 2) {
      const result = chooseConversion(selected);
      if (!result) {
        browser.runtime.sendMessage({ type: "NOTIFY", text: "متن مشکوکی برای اصلاح پیدا نشد." });
        return;
      }
      replaceSelection(active, result.text);
      return;
    }

    if (!isEditable(active)) {
      browser.runtime.sendMessage({ type: "NOTIFY", text: "ابتدا داخل یک کادر متن کلیک کنید." });
      return;
    }

    const value = active.value ?? active.innerText ?? active.textContent ?? "";
    const result = chooseConversion(value);

    if (!result) {
      browser.runtime.sendMessage({ type: "NOTIFY", text: "متن مشکوکی برای اصلاح پیدا نشد." });
      return;
    }

    replaceWholeEditable(active, result.text);
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== "FIX_TEXT") return;
    if (message.selectedText && getSelectedText() === message.selectedText) {
      fixCurrent();
    } else {
      fixCurrent();
    }
  });

  // Automatic protection against the common mistake:
  // after a short burst of typing, inspect the current field.
  // Passwords and code-like fields are deliberately excluded.
  let timer = null;
  let lastValue = "";

  document.addEventListener("input", (event) => {
    const el = event.target;
    if (!isEditable(el)) return;
    if (el.tagName === "INPUT" && el.type === "password") return;

    const value = el.value ?? el.innerText ?? "";
    if (!value || value === lastValue || value.length < 4) return;
    lastValue = value;

    clearTimeout(timer);
    timer = setTimeout(() => {
      const result = chooseConversion(value);
      if (!result) return;

      // Avoid firing while the user is in the middle of an IME/composition.
      if (event.isComposing) return;

      const answer = window.confirm(
        "به نظر می‌رسد متن با زبان اشتباه کیبورد تایپ شده است.\n\n" +
        "آیا اصلاحش کنم؟\n\n" + result.text
      );
      if (answer) replaceWholeEditable(el, result.text);
    }, 850);
  }, true);
})();
