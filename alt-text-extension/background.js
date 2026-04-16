// Context-Aware Alt Text Support - Background Service Worker

importScripts("api.js");

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

  // Handle alt text generation request from content script or popup
  if (message.type === "GENERATE_ALT_TEXT") {
    generateAltText(message.imageUrl, message.context)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) =>
        sendResponse({ success: false, error: err.message })
      );
    return true; // Keep channel open for async response
  }

  // Handle batch generation for all missing images
  if (message.type === "GENERATE_ALL_ALT_TEXT") {
    const images = message.images || [];
    const results = [];

    (async () => {
      for (const img of images) {
        try {
          const result = await generateAltText(img.src, img.context);
          results.push({ src: img.src, success: true, ...result });
        } catch (err) {
          results.push({ src: img.src, success: false, error: err.message });
        }
      }
      sendResponse({ success: true, results });
    })();

    return true; // Keep channel open for async response
  }

  // Check if API is configured
  if (message.type === "CHECK_API_CONFIG") {
    getApiSettings().then((settings) => {
      sendResponse({ configured: !!settings.apiKey });
    });
    return true;
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabResults[tabId];
});
