// Context-Aware Alt Text Support - Content Script
// Week 1: Detect images and isolate those with missing alt text

(function () {
  "use strict";

  const SCAN_DELAY_MS = 500;

  function isDecorative(img) {
    // Heuristics for decorative images
    if (img.getAttribute("role") === "presentation") return true;
    if (img.getAttribute("role") === "none") return true;
    if (img.getAttribute("aria-hidden") === "true") return true;
    if (img.alt === "") return true; // Explicitly empty alt = decorative

    // Very small images are likely icons/spacers
    const rect = img.getBoundingClientRect();
    if (rect.width <= 5 && rect.height <= 5) return true;

    return false;
  }

  function isMissingAltText(img) {
    // alt attribute is completely absent (not the same as alt="")
    return !img.hasAttribute("alt");
  }

  function getSurroundingContext(img) {
    const parent = img.closest("figure, article, section, div, p, a");
    if (!parent) return "";

    const text = parent.innerText || "";
    // Get first 200 chars of surrounding text as context
    return text.substring(0, 200).trim();
  }

  function createWarningBadge(img, index) {
    // Ensure the image's parent can hold absolute-positioned children
    const parent = img.parentElement;
    if (parent && getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    // Warning badge
    const badge = document.createElement("span");
    badge.className = "alt-text-warning-badge";
    badge.textContent = "!";
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", "This image is missing alt text");
    badge.dataset.altTextIndex = index;

    // Tooltip
    const tooltip = document.createElement("span");
    tooltip.className = "alt-text-tooltip";
    const src = img.src ? img.src.substring(0, 60) + "..." : "unknown";
    tooltip.textContent = `Missing alt text. Source: ${src}`;

    img.parentElement.insertBefore(badge, img);
    img.parentElement.insertBefore(tooltip, img);
  }

  function scanPage() {
    const images = document.querySelectorAll("img");
    const results = {
      total: images.length,
      missing: 0,
      decorative: 0,
      hasAlt: 0,
      images: [],
    };

    // Clear any previous scan overlays
    document
      .querySelectorAll(
        ".alt-text-warning-badge, .alt-text-tooltip, .alt-text-missing-overlay, .alt-text-has-alt, .alt-text-decorative"
      )
      .forEach((el) => {
        if (
          el.classList.contains("alt-text-warning-badge") ||
          el.classList.contains("alt-text-tooltip")
        ) {
          el.remove();
        } else {
          el.classList.remove(
            "alt-text-missing-overlay",
            "alt-text-has-alt",
            "alt-text-decorative"
          );
        }
      });

    let missingIndex = 0;

    images.forEach((img) => {
      const rect = img.getBoundingClientRect();
      // Skip invisible images
      if (rect.width === 0 && rect.height === 0) return;

      const imgData = {
        src: img.src,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        context: getSurroundingContext(img),
      };

      if (isDecorative(img)) {
        img.classList.add("alt-text-decorative");
        imgData.status = "decorative";
        results.decorative++;
      } else if (isMissingAltText(img)) {
        img.classList.add("alt-text-missing-overlay");
        imgData.status = "missing";
        createWarningBadge(img, missingIndex);
        missingIndex++;
        results.missing++;
      } else {
        img.classList.add("alt-text-has-alt");
        imgData.status = "has-alt";
        imgData.currentAlt = img.alt;
        results.hasAlt++;
      }

      results.images.push(imgData);
    });

    // Calculate accessibility score (0-100)
    if (results.total > 0) {
      const nonDecorative = results.total - results.decorative;
      if (nonDecorative > 0) {
        results.score = Math.round((results.hasAlt / nonDecorative) * 100);
      } else {
        results.score = 100; // All images are decorative
      }
    } else {
      results.score = 100; // No images on page
    }

    return results;
  }

  // Run scan after page loads
  let scanResults = null;

  function runScan() {
    scanResults = scanPage();
    // Send results to background script for the popup
    chrome.runtime.sendMessage({
      type: "SCAN_RESULTS",
      data: scanResults,
    });
  }

  // Initial scan with delay to let page finish rendering
  setTimeout(runScan, SCAN_DELAY_MS);

  // Listen for rescan requests from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "REQUEST_SCAN") {
      runScan();
      sendResponse(scanResults);
    } else if (message.type === "GET_RESULTS") {
      sendResponse(scanResults);
    }
    return true;
  });

  // Watch for dynamically added images
  const observer = new MutationObserver((mutations) => {
    let hasNewImages = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName === "IMG" || node.querySelector?.("img")) {
          hasNewImages = true;
          break;
        }
      }
      if (hasNewImages) break;
    }
    if (hasNewImages) {
      setTimeout(runScan, SCAN_DELAY_MS);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
