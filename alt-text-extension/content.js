// Context-Aware Alt Text Support - Content Script
// Week 1: Detect images missing alt text
// Week 2: Generate and inject AI-based alt text via TAMU API

(function () {
  "use strict";

  const SCAN_DELAY_MS = 500;

  // Returns the best available src for an image, handling lazy-load patterns
  // where libraries store the real URL in data-src / data-lazy / data-original
  function getEffectiveSrc(img) {
    if (img.src && !img.src.endsWith(window.location.href)) {
      // If the loaded image is a tiny placeholder (1×1 spacer) but a real src
      // is stashed in a data attribute, prefer that.
      const isPlaceholder =
        img.naturalWidth <= 1 &&
        img.naturalHeight <= 1 &&
        img.complete;
      if (!isPlaceholder) return img.src;
    }
    return (
      img.dataset.src ||
      img.dataset.lazySrc ||
      img.dataset.original ||
      img.dataset.lazy ||
      img.src
    );
  }

  function isDecorative(img) {
    if (img.getAttribute("role") === "presentation") return true;
    if (img.getAttribute("role") === "none") return true;
    if (img.getAttribute("aria-hidden") === "true") return true;
    if (img.getAttribute("alt") === "") return true;

    const rect = img.getBoundingClientRect();
    if (rect.width <= 5 && rect.height <= 5) return true;

    return false;
  }

  function isMissingAltText(img) {
    return !img.hasAttribute("alt");
  }

  function getSurroundingContext(img) {
    const parent = img.closest("figure, article, section, div, p, a");
    if (!parent) return "";

    const text = parent.innerText || "";
    return text.substring(0, 200).trim();
  }

  function createWarningBadge(img, index) {
    const parent = img.parentElement;
    if (parent && getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    // Warning badge - now clickable to generate alt text
    const badge = document.createElement("span");
    badge.className = "alt-text-warning-badge";
    badge.textContent = "!";
    badge.setAttribute("role", "button");
    badge.setAttribute(
      "aria-label",
      "This image is missing alt text. Click to generate."
    );
    badge.dataset.altTextIndex = index;
    badge.title = "Click to generate alt text";

    // Tooltip
    const tooltip = document.createElement("span");
    tooltip.className = "alt-text-tooltip";
    tooltip.dataset.altTextIndex = index;
    const src = img.src ? img.src.substring(0, 60) + "..." : "unknown";
    tooltip.textContent = `Missing alt text. Click ! to generate. Source: ${src}`;

    // Click handler to generate alt text for this image
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      generateForImage(img, badge, tooltip);
    });

    img.parentElement.insertBefore(badge, img);
    img.parentElement.insertBefore(tooltip, img);
  }

  function generateForImage(img, badge, tooltip) {
    // Show loading state
    badge.textContent = "...";
    badge.classList.add("alt-text-loading");
    tooltip.textContent = "Generating alt text...";
    tooltip.style.display = "block";

    const context = getSurroundingContext(img);

    chrome.runtime.sendMessage(
      {
        type: "GENERATE_ALT_TEXT",
        imageUrl: img.src,
        context: context,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          badge.textContent = "X";
          badge.classList.remove("alt-text-loading");
          tooltip.textContent = `Error: ${chrome.runtime.lastError.message}`;
          return;
        }

        if (response && response.success) {
          if (response.isDecorative) {
            // Mark as decorative
            img.setAttribute("alt", "");
            img.setAttribute("role", "presentation");
            img.classList.remove("alt-text-missing-overlay");
            img.classList.add("alt-text-decorative");
            badge.textContent = "D";
            badge.classList.remove("alt-text-loading");
            badge.classList.add("alt-text-generated");
            badge.style.background = "#ffa726";
            tooltip.textContent = "Marked as decorative";
          } else {
            // Inject the generated alt text
            img.setAttribute("alt", response.altText);
            img.classList.remove("alt-text-missing-overlay");
            img.classList.add("alt-text-has-alt");

            // Update badge to success state
            badge.textContent = "\u2713";
            badge.classList.remove("alt-text-loading");
            badge.classList.add("alt-text-generated");
            badge.style.background = "#43a047";
            tooltip.textContent = `Alt: "${response.altText}"`;
            tooltip.style.display = "block";
          }

          // Re-run scan to update counts
          scheduleScan();
        } else {
          badge.textContent = "X";
          badge.classList.remove("alt-text-loading");
          tooltip.textContent = `Error: ${response?.error || "Unknown error"}`;
        }
      }
    );
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

    // Clear previous overlays
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
      if (rect.width === 0 && rect.height === 0) return;

      const imgData = {
        src: getEffectiveSrc(img),
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

    if (results.total > 0) {
      const nonDecorative = results.total - results.decorative;
      if (nonDecorative > 0) {
        results.score = Math.round((results.hasAlt / nonDecorative) * 100);
      } else {
        results.score = 100;
      }
    } else {
      results.score = 100;
    }

    return results;
  }

  function applyPersistedAltTexts() {
    return new Promise((resolve) => {
      const pageKey = location.href;
      chrome.storage.local.get(["altTextStore"], (data) => {
        const store = (data.altTextStore || {})[pageKey] || {};
        for (const [src, entry] of Object.entries(store)) {
          const img = document.querySelector(`img[src="${src}"]`);
          if (!img) continue;
          if (entry.decorative) {
            img.setAttribute("alt", "");
            img.setAttribute("role", "presentation");
          } else if (entry.altText) {
            img.setAttribute("alt", entry.altText);
          }
        }
        resolve();
      });
    });
  }

  let scanResults = null;
  let scanTimer = null;

  function runScan() {
    scanResults = scanPage();
    chrome.runtime.sendMessage({
      type: "SCAN_RESULTS",
      data: scanResults,
    });
  }

  // Debounced scheduler — collapses rapid mutations into a single scan
  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(runScan, SCAN_DELAY_MS);
  }

  setTimeout(async () => {
    await applyPersistedAltTexts();
    runScan();
  }, SCAN_DELAY_MS);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "REQUEST_SCAN") {
      runScan();
      sendResponse(scanResults);
    } else if (message.type === "GET_RESULTS") {
      sendResponse(scanResults);
    } else if (message.type === "INJECT_ALT_TEXT") {
      // Inject alt text for a specific image by src
      const img = document.querySelector(`img[src="${message.src}"]`);
      if (img) {
        img.setAttribute("alt", message.altText);
        img.classList.remove("alt-text-missing-overlay");
        img.classList.add("alt-text-has-alt");
        runScan();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Image not found" });
      }
    } else if (message.type === "INJECT_DECORATIVE") {
      const img = document.querySelector(`img[src="${message.src}"]`);
      if (img) {
        img.setAttribute("alt", "");
        img.setAttribute("role", "presentation");
        img.classList.remove("alt-text-missing-overlay");
        img.classList.add("alt-text-decorative");
        runScan();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Image not found" });
      }
    }
    return true;
  });

  const observer = new MutationObserver((mutations) => {
    let shouldRescan = false;
    for (const mutation of mutations) {
      // New <img> nodes added (infinite scroll, dynamic content)
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === "IMG" || node.querySelector?.("img")) {
            shouldRescan = true;
            break;
          }
        }
      }
      // Lazy-load: src/data-src attribute swapped in on an existing <img>
      if (
        mutation.type === "attributes" &&
        mutation.target.nodeName === "IMG"
      ) {
        shouldRescan = true;
      }
      if (shouldRescan) break;
    }
    if (shouldRescan) scheduleScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "data-src", "data-lazy", "data-original"],
  });
})();
