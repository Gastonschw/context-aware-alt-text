// Context-Aware Alt Text Support - Background Service Worker

// Store scan results per tab
const tabResults = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCAN_RESULTS" && sender.tab) {
    tabResults[sender.tab.id] = message.data;

    // Update badge with count of missing alt text
    const missing = message.data.missing || 0;
    const badgeText = missing > 0 ? String(missing) : "";
    const badgeColor = missing > 0 ? "#e53935" : "#43a047";

    chrome.action.setBadgeText({ text: badgeText, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({
      color: badgeColor,
      tabId: sender.tab.id,
    });
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabResults[tabId];
});
