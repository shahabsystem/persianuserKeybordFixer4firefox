const MENU_ID = "farsi-keyboard-fix";

browser.runtime.onInstalled.addListener(() => {
  browser.menus.create({
    id: MENU_ID,
    title: "اصلاح کیبورد فارسی/انگلیسی",
    contexts: ["editable", "selection"]
  });
});

browser.menus.onClicked.addListener((info, tab) => {
  if (!tab?.id || info.menuItemId !== MENU_ID) return;
  browser.tabs.sendMessage(tab.id, {
    type: "FIX_TEXT",
    selectedText: info.selectionText || null
  }).catch(() => {});
});

browser.commands.onCommand.addListener((command, tab) => {
  if (command !== "fix-keyboard" || !tab?.id) return;
  browser.tabs.sendMessage(tab.id, { type: "FIX_TEXT" }).catch(() => {});
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "NOTIFY") {
    browser.notifications.create({
      type: "basic",
      title: "Farsi Keyboard Fix",
      message: message.text || "انجام شد."
    });
  }
});
