const DEFAULTS = {
  enabled: true,
  autoReplace: false,
  shortcut: "Alt+Shift+K"
};

async function getSettings() {
  return browser.storage.local.get(DEFAULTS);
}

function createMenu() {
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

browser.runtime.onInstalled.addListener(createMenu);
browser.runtime.onStartup.addListener(createMenu);

browser.menus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "open-options") {
    browser.runtime.openOptionsPage();
    return;
  }
  if (info.menuItemId === "fix-keyboard") {
    browser.tabs.sendMessage(tab.id, {
      type: "FIX_TEXT",
      selectedText: info.selectionText || ""
    }).catch(() => {});
  }
});

browser.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "fix-keyboard" || !tab?.id) return;
  const settings = await getSettings();
  if (!settings.enabled) return;
  browser.tabs.sendMessage(tab.id, { type: "FIX_TEXT" }).catch(() => {});
});

browser.runtime.onMessage.addListener(async (message) => {
  if (!message) return;

  if (message.type === "GET_SETTINGS") {
    return getSettings();
  }

  if (message.type === "SETTINGS_CHANGED") {
    createMenu();
    const settings = await getSettings();
    browser.tabs.query({}).then(tabs => {
      for (const tab of tabs) {
        if (!tab.id) continue;
        browser.tabs.sendMessage(tab.id, {
          type: "SETTINGS",
          settings
        }).catch(() => {});
      }
    });
  }

  if (message.type === "NOTIFY") {
    browser.notifications.create({
      type: "basic",
      title: "Farsi Keyboard Fix",
      message: String(message.text || "")
    }).catch(() => {});
  }
});

browser.browserAction.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});
