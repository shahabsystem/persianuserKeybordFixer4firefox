const DEFAULTS = {
  enabled: true,
  autoReplace: false,
  shortcut: "Alt+Shift+K",
  customWords: {}
};

async function settings() {
  return browser.storage.local.get(DEFAULTS);
}

function rebuildMenus() {
  browser.menus.removeAll().then(() => {
    browser.menus.create({
      id: "fix-keyboard",
      title: "اصلاح کیبورد فارسی/انگلیسی",
      contexts: ["editable", "selection"]
    });
    browser.menus.create({
      id: "open-options",
      title: "تنظیمات Farsi Keyboard Fix",
      contexts: ["all"]
    });
  }).catch(() => {});
}

browser.runtime.onInstalled.addListener(async () => {
  const current = await browser.storage.local.get(null);
  await browser.storage.local.set({...DEFAULTS, ...current});
  rebuildMenus();
});

browser.runtime.onStartup.addListener(rebuildMenus);

browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-options") {
    browser.runtime.openOptionsPage();
    return;
  }
  if (info.menuItemId === "fix-keyboard" && tab?.id) {
    browser.tabs.sendMessage(tab.id, {
      type: "FIX_TEXT",
      selectedText: info.selectionText || ""
    }).catch(() => {});
  }
});

browser.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "fix-keyboard" || !tab?.id) return;
  const s = await settings();
  if (!s.enabled) return;
  browser.tabs.sendMessage(tab.id, {type: "FIX_TEXT"}).catch(() => {});
});

browser.runtime.onMessage.addListener(async (m) => {
  if (!m) return;
  if (m.type === "GET_SETTINGS") return settings();

  if (m.type === "SETTINGS_CHANGED") {
    rebuildMenus();
    const s = await settings();
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) browser.tabs.sendMessage(tab.id, {type:"SETTINGS", settings:s}).catch(()=>{});
    }
  }

  if (m.type === "NOTIFY") {
    browser.notifications.create({
      type:"basic",
      title:"Farsi Keyboard Fix",
      message:String(m.text || "")
    }).catch(()=>{});
  }
});

browser.browserAction.onClicked.addListener(() => browser.runtime.openOptionsPage());