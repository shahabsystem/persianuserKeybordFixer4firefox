const DEFAULTS = {
  enabled: true,
  autoReplace: false,
  shortcut: "Alt+Shift+K"
};

const $ = id => document.getElementById(id);

async function load() {
  const s = await browser.storage.local.get(DEFAULTS);
  $("enabled").checked = !!s.enabled;
  $("autoReplace").checked = !!s.autoReplace;
  $("shortcut").value = s.shortcut || "";
}

async function save(patch) {
  await browser.storage.local.set(patch);
  await browser.runtime.sendMessage({type:"SETTINGS_CHANGED"});
}

$("enabled").addEventListener("change", e => save({enabled:e.target.checked}));
$("autoReplace").addEventListener("change", e => save({autoReplace:e.target.checked}));

$("clearShortcut").addEventListener("click", async () => {
  $("shortcut").value = "";
  $("shortcutStatus").textContent = "میانبر پاک شد";
  await save({shortcut:""});
});

$("shortcut").addEventListener("keydown", async e => {
  e.preventDefault();
  e.stopPropagation();

  if (["Control","Alt","Shift","Meta"].includes(e.key)) return;

  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");

  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();

  if (!parts.length) {
    $("shortcutStatus").textContent = "برای جلوگیری از اجرای ناخواسته، حداقل یک Ctrl/Alt/Shift/Meta اضافه کنید.";
    return;
  }

  if (["Control","Alt","Shift","Meta"].includes(key)) return;

  parts.push(key);
  const value = parts.join("+");
  $("shortcut").value = value;
  $("shortcutStatus").textContent = "ذخیره شد";
  await save({shortcut:value});
});

load();
