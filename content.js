(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    autoReplace: false,
    shortcut: "Alt+Shift+K"
  };

  let settings = { ...DEFAULTS };
  let timer = null;
  let lastCandidate = "";
  let composing = false;

  // Standard Windows Persian keyboard layout.
  const EN_TO_FA = {
    "q":"ض","w":"ص","e":"ث","r":"ق","t":"ف","y":"غ","u":"ع","i":"ه","o":"خ","p":"ح",
    "[":"ج","]":"چ","a":"ش","s":"س","d":"ی","f":"ب","g":"ل","h":"ا","j":"ت","k":"ن","l":"م",
    ";":"ک","'":"گ","z":"ظ","x":"ط","c":"ز","v":"ر","b":"ذ","n":"د","m":"پ",
    ",":"و",".":".","/":"/","`":"پ"
  };
  const FA_TO_EN = Object.fromEntries(Object.entries(EN_TO_FA).map(([k,v]) => [v,k]));
  Object.assign(FA_TO_EN, {
    "آ":"G","ژ":"C","ء":"X","ؤ":"C","ي":"D","ى":"D"
  });

  // Common Persian words give the detector a strong signal without
  // sending any text outside the browser.
  const COMMON_FA = new Set([
    "سلام","خوب","خوبی","من","تو","شما","این","آن","که","را","به","از","برای",
    "با","در","و","یا","اگر","ولی","اما","هم","خیلی","ممنون","لطفا","لطفاً",
    "برنامه","فایل","متن","کیبورد","فارسی","انگلیسی","است","هست","هستم",
    "می","شود","شد","کرد","کردم","دارم","دارد","دارید","کن","کنم","کند",
    "امروز","فردا","چه","چرا","کجا","چطور","یک","دو","سه","نه","بله"
  ]);

  const COMMON_EN = new Set([
    "the","and","you","your","this","that","is","are","was","for","with",
    "from","hello","test","please","thanks","thank","what","how","why",
    "not","can","will","have","has","about","github","firefox","google"
  ]);

  function count(text, regex) {
    return [...text].filter(c => regex.test(c)).length;
  }

  function words(text) {
    return text.toLowerCase().match(/[a-z\u0600-\u06ff]+/g) || [];
  }

  function keyboardConvert(text, map) {
    return [...text].map(c => map[c.toLowerCase()] ?? c).join("");
  }

  function languageScore(text, lang) {
    const ws = words(text);
    if (!ws.length) return 0;

    const common = lang === "fa" ? COMMON_FA : COMMON_EN;
    let score = 0;
    for (const w of ws) {
      if (common.has(w)) score += 4;
    }
    return score;
  }

  function detect(text) {
    if (!text || text.trim().length < 2) return null;

    // Do not touch likely URLs, email addresses, file paths or code.
    if (/https?:\/\/|www\.|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b(?:npm|git|ssh|ftp)\b/i.test(text)) {
      return null;
    }

    const fa = count(text, /[\u0600-\u06ff]/);
    const en = count(text, /[A-Za-z]/);
    const totalLetters = fa + en;
    if (totalLetters < 2) return null;

    const toFa = keyboardConvert(text, EN_TO_FA);
    const toEn = keyboardConvert(text, FA_TO_EN);

    const originalFa = fa / totalLetters;
    const originalEn = en / totalLetters;
    const faCandidateRatio = count(toFa, /[\u0600-\u06ff]/) / Math.max(1, count(toFa, /[\u0600-\u06ff]|[A-Za-z]/));
    const enCandidateRatio = count(toEn, /[A-Za-z]/) / Math.max(1, count(toEn, /[\u0600-\u06ff]|[A-Za-z]/));

    const originalFaScore = languageScore(text, "fa") + originalFa * 2;
    const originalEnScore = languageScore(text, "en") + originalEn * 2;
    const faScore = languageScore(toFa, "fa") + faCandidateRatio * 2;
    const enScore = languageScore(toEn, "en") + enCandidateRatio * 2;

    // Stronger evidence is required for automatic replacement.
    if (en >= 2 && faScore >= originalEnScore + 2 && faCandidateRatio >= 0.55) {
      return { text: toFa, direction: "en-fa", confidence: Math.min(1, (faScore - originalEnScore) / 8) };
    }

    if (fa >= 2 && enScore >= originalFaScore + 2 && enCandidateRatio >= 0.55) {
      return { text: toEn, direction: "fa-en", confidence: Math.min(1, (enScore - originalFaScore) / 8) };
    }

    return null;
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      return ["text","search","url","email","tel"].includes((el.type || "text").toLowerCase());
    }
    return el.isContentEditable === true;
  }

  function getValue(el) {
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA"
      ? el.value
      : el.innerText || "";
  }

  function setValue(el, text) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const proto = el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, text);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  function selectedText() {
    const s = window.getSelection();
    return s && s.rangeCount ? s.toString() : "";
  }

  function replaceSelected(el, text) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? start;
      el.setRangeText(text, start, end, "end");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      return;
    }
    document.execCommand("insertText", false, text);
  }

  function showSuggestion(result, el, selected) {
    const old = document.getElementById("fkk-suggestion");
    old?.remove();

    const box = document.createElement("div");
    box.id = "fkk-suggestion";
    box.dir = "rtl";
    box.textContent = `⌨️ احتمالاً کیبورد اشتباه بوده: «${result.text}» — برای جایگزینی کلیک کنید`;
    Object.assign(box.style, {
      position:"fixed", zIndex:"2147483647", right:"16px", bottom:"16px",
      maxWidth:"min(600px, calc(100vw - 32px))", padding:"12px 16px",
      background:"#202124", color:"#fff", borderRadius:"10px",
      boxShadow:"0 4px 18px rgba(0,0,0,.35)", font:"14px sans-serif",
      cursor:"pointer"
    });
    box.addEventListener("click", () => {
      if (selected) replaceSelected(el, result.text);
      else setValue(el, result.text);
      box.remove();
    });
    document.documentElement.appendChild(box);
    setTimeout(() => box.remove(), 8000);
  }

  function fixNow() {
    if (!settings.enabled) return;

    const el = document.activeElement;
    const selected = selectedText();

    if (selected.length >= 2 && isEditable(el)) {
      const result = detect(selected);
      if (!result) {
        browser.runtime.sendMessage({type:"NOTIFY", text:"متن مشکوکی برای اصلاح پیدا نشد."}).catch(()=>{});
        return;
      }
      replaceSelected(el, result.text);
      return;
    }

    if (!isEditable(el)) {
      browser.runtime.sendMessage({type:"NOTIFY", text:"ابتدا داخل یک کادر متن کلیک کنید."}).catch(()=>{});
      return;
    }

    const value = getValue(el);
    const result = detect(value);
    if (!result) {
      browser.runtime.sendMessage({type:"NOTIFY", text:"متن مشکوکی برای اصلاح پیدا نشد."}).catch(()=>{});
      return;
    }
    setValue(el, result.text);
  }

  function normalizeKey(key) {
    return key.length === 1 ? key.toUpperCase() : key;
  }

  function shortcutMatches(e) {
    if (!settings.shortcut) return false;
    const parts = settings.shortcut.split("+").map(normalizeKey);
    const key = normalizeKey(e.key);
    if (!parts.includes(key)) return false;

    const wantCtrl = parts.includes("CTRL") || parts.includes("CONTROL");
    const wantAlt = parts.includes("ALT");
    const wantShift = parts.includes("SHIFT");
    const wantMeta = parts.includes("META") || parts.includes("CMD");

    return !!e.ctrlKey === wantCtrl &&
           !!e.altKey === wantAlt &&
           !!e.shiftKey === wantShift &&
           !!e.metaKey === wantMeta;
  }

  document.addEventListener("compositionstart", () => composing = true, true);
  document.addEventListener("compositionend", () => composing = false, true);

  document.addEventListener("keydown", e => {
    if (!settings.enabled || composing) return;
    if (shortcutMatches(e)) {
      e.preventDefault();
      e.stopPropagation();
      fixNow();
    }
  }, true);

  document.addEventListener("input", e => {
    if (!settings.enabled || !settings.autoReplace || composing) return;
    const el = e.target;
    if (!isEditable(el)) return;
    if (el.tagName === "INPUT" && el.type === "password") return;

    const value = getValue(el);
    if (!value || value === lastCandidate || value.length < 4) return;
    lastCandidate = value;

    clearTimeout(timer);
    timer = setTimeout(() => {
      const result = detect(value);
      if (!result || result.confidence < 0.45) return;
      setValue(el, result.text);
    }, 700);
  }, true);

  browser.runtime.onMessage.addListener(message => {
    if (message?.type === "SETTINGS") settings = {...DEFAULTS, ...(message.settings || {})};
    if (message?.type === "FIX_TEXT") fixNow();
  });

  browser.runtime.sendMessage({type:"GET_SETTINGS"}).then(s => {
    settings = {...DEFAULTS, ...(s || {})};
  }).catch(()=>{});
})();
