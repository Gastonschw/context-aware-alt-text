// Context-Aware Alt Text Support - Popup Script

document.addEventListener("DOMContentLoaded", () => {
  const scoreValue = document.getElementById("scoreValue");
  const scoreCircle = document.getElementById("scoreCircle");
  const totalImages = document.getElementById("totalImages");
  const missingAlt = document.getElementById("missingAlt");
  const hasAlt = document.getElementById("hasAlt");
  const decorative = document.getElementById("decorative");
  const imageList = document.getElementById("imageList");
  const imageListSection = document.getElementById("imageListSection");
  const rescanBtn = document.getElementById("rescanBtn");
  const generateAllBtn = document.getElementById("generateAllBtn");
  const generateStatus = document.getElementById("generateStatus");
  const bulkReviewActions = document.getElementById("bulkReviewActions");
  const acceptAllBtn = document.getElementById("acceptAllBtn");
  const rejectAllBtn = document.getElementById("rejectAllBtn");
  const apiWarning = document.getElementById("apiWarning");
  const openSettingsLink = document.getElementById("openSettingsLink");
  const settingsLink = document.getElementById("settingsLink");
  const infoLink = document.getElementById("infoLink");

  let currentData = null;
  let currentTabId = null;
  let currentPageUrl = null;

  // Grab the active tab info upfront
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabId = tabs[0].id;
      currentPageUrl = tabs[0].url;
    }
  });

  // Check if API is configured
  chrome.runtime.sendMessage({ type: "CHECK_API_CONFIG" }, (response) => {
    if (!response?.configured) {
      apiWarning.style.display = "block";
      generateAllBtn.disabled = true;
      generateAllBtn.style.opacity = "0.5";
    }
  });

  // Settings links
  function openSettings(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  }
  openSettingsLink.addEventListener("click", openSettings);
  settingsLink.addEventListener("click", openSettings);
  infoLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("info.html") });
  });

  // ── Per-image list item builder ──────────────────────────────────────────

  function buildImageListItem(img) {
    const li = document.createElement("li");
    li.dataset.imgSrc = img.src;
    li.tabIndex = 0;
    li.setAttribute("role", "listitem");

    const filename = img.src.split("/").pop().split("?")[0] || "unknown";
    li.setAttribute("aria-label", `Image: ${filename}, missing alt text`);

    // Thumbnail
    const thumbnail = document.createElement("img");
    thumbnail.src = img.src;
    thumbnail.alt = `Thumbnail of ${filename}`;
    thumbnail.onerror = () => { thumbnail.style.display = "none"; };

    // Info column
    const info = document.createElement("div");
    info.className = "img-info";

    const srcSpan = document.createElement("span");
    srcSpan.className = "img-src";
    srcSpan.textContent = filename;
    info.appendChild(srcSpan);

    if (img.context) {
      const contextSpan = document.createElement("span");
      contextSpan.className = "img-context";
      contextSpan.textContent =
        img.context.substring(0, 60) + (img.context.length > 60 ? "..." : "");
      info.appendChild(contextSpan);
    }

    const sizeSpan = document.createElement("span");
    sizeSpan.className = "img-src";
    sizeSpan.textContent = `${img.width} x ${img.height}px`;
    info.appendChild(sizeSpan);

    // Review panel (hidden until generation completes)
    const reviewPanel = buildReviewPanel(img.src, filename);
    info.appendChild(reviewPanel);

    // Per-image Generate button
    const genBtn = document.createElement("button");
    genBtn.className = "btn-gen-single";
    genBtn.textContent = "Generate";
    genBtn.setAttribute("aria-label", `Generate alt text for ${filename}`);
    genBtn.addEventListener("click", () =>
      generateForItem(img, genBtn, reviewPanel)
    );

    li.addEventListener("click", () => setActiveListItem(li));
    li.addEventListener("focusin", () => setActiveListItem(li));
    li.addEventListener("mouseenter", () => setActiveListItem(li));

    // Keyboard activation for list items
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActiveListItem(li);
      }
    });

    li.appendChild(thumbnail);
    li.appendChild(info);
    li.appendChild(genBtn);
    return li;
  }

  function buildReviewPanel(src, filename) {
    const panel = document.createElement("div");
    panel.className = "review-panel";
    panel.style.display = "none";
    panel.setAttribute("aria-hidden", "true");

    // Decorative toggle
    const decorativeLabel = document.createElement("label");
    decorativeLabel.className = "decorative-toggle";
    const decorativeCheck = document.createElement("input");
    decorativeCheck.type = "checkbox";
    decorativeCheck.className = "decorative-check";
    decorativeLabel.appendChild(decorativeCheck);
    decorativeLabel.appendChild(document.createTextNode(" Mark as decorative"));
    panel.appendChild(decorativeLabel);

    // Alt text textarea
    const textarea = document.createElement("textarea");
    textarea.className = "alt-text-edit";
    textarea.rows = 2;
    textarea.placeholder = "Generated alt text...";
    textarea.setAttribute("aria-label", `Alt text for ${filename || "image"}`);
    panel.appendChild(textarea);

    // Toggle textarea when decorative is checked
    decorativeCheck.addEventListener("change", () => {
      textarea.disabled = decorativeCheck.checked;
      textarea.placeholder = decorativeCheck.checked
        ? "Image will be marked as decorative"
        : "Generated alt text...";
    });

    // Accept / Reject buttons
    const reviewActions = document.createElement("div");
    reviewActions.className = "review-actions";
    reviewActions.setAttribute("role", "group");
    reviewActions.setAttribute("aria-label", "Review actions");

    const acceptBtn = document.createElement("button");
    acceptBtn.className = "btn-accept";
    acceptBtn.textContent = "Accept";
    acceptBtn.addEventListener("click", () => {
      const li = panel.closest("li");
      acceptAltText(src, textarea.value, decorativeCheck.checked, li);
    });

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "btn-reject";
    rejectBtn.textContent = "Reject";
    rejectBtn.addEventListener("click", () => {
      const li = panel.closest("li");
      rejectAltText(li, panel);
    });

    reviewActions.appendChild(acceptBtn);
    reviewActions.appendChild(rejectBtn);
    panel.appendChild(reviewActions);

    return panel;
  }

  // ── Generation helpers ───────────────────────────────────────────────────

  function showReviewPanel(reviewPanel, result) {
    reviewPanel.style.display = "block";
    reviewPanel.setAttribute("aria-hidden", "false");
    const textarea = reviewPanel.querySelector(".alt-text-edit");
    const decorativeCheck = reviewPanel.querySelector(".decorative-check");

    if (result.success) {
      if (result.isDecorative) {
        decorativeCheck.checked = true;
        textarea.disabled = true;
        textarea.placeholder = "Image will be marked as decorative";
      } else {
        textarea.value = result.altText;
      }
    } else {
      textarea.placeholder = `Error: ${result.error || "Unknown error"}`;
    }

    updateBulkActionVisibility();
  }

  function generateForItem(img, genBtn, reviewPanel) {
    genBtn.textContent = "...";
    genBtn.disabled = true;
    genBtn.setAttribute("aria-busy", "true");

    chrome.runtime.sendMessage(
      { type: "GENERATE_ALT_TEXT", imageUrl: img.src, context: img.context },
      (response) => {
        genBtn.style.display = "none";
        genBtn.setAttribute("aria-busy", "false");
        showReviewPanel(reviewPanel, response || { success: false, error: "No response" });
      }
    );
  }

  function acceptAltText(src, altText, isDecorative, li, skipRefresh = false) {
    if (!currentTabId) return;

    // Inject into the page DOM
    if (isDecorative) {
      chrome.tabs.sendMessage(currentTabId, { type: "INJECT_DECORATIVE", src });
    } else {
      chrome.tabs.sendMessage(currentTabId, {
        type: "INJECT_ALT_TEXT",
        src,
        altText,
      });
    }

    // Persist the accepted value
    chrome.runtime.sendMessage({
      type: "SAVE_ALT_TEXT",
      pageUrl: currentPageUrl,
      src,
      altText: isDecorative ? "" : altText,
      decorative: isDecorative,
    });

    // Show accepted state in the list item
    const reviewPanel = li.querySelector(".review-panel");
    const label = isDecorative
      ? "Marked as decorative"
      : `\u2713 "${altText.substring(0, 50)}${altText.length > 50 ? "..." : ""}"`;
    reviewPanel.innerHTML = `<span class="accepted-label" role="status">${label}</span>`;
    li.classList.add("item-accepted");
    li.setAttribute("aria-label", li.getAttribute("aria-label").replace("missing alt text", isDecorative ? "marked decorative" : "alt text accepted"));
    li.dataset.accepted = "true";
    updateBulkActionVisibility();

    // Refresh counts after a short delay
    if (!skipRefresh) {
      setTimeout(() => {
        refreshScoreFromPage();
      }, 300);
    }
  }

  function rejectAltText(li, reviewPanel) {
    reviewPanel.style.display = "none";
    reviewPanel.setAttribute("aria-hidden", "true");
    const genBtn = li.querySelector(".btn-gen-single");
    genBtn.textContent = "Generate";
    genBtn.disabled = false;
    genBtn.style.display = "";
    // Reset textarea & checkbox
    reviewPanel.querySelector(".alt-text-edit").value = "";
    reviewPanel.querySelector(".alt-text-edit").disabled = false;
    reviewPanel.querySelector(".decorative-check").checked = false;
    li.dataset.accepted = "";
    updateBulkActionVisibility();
  }

  // ── UI update ────────────────────────────────────────────────────────────

  function updateScoreAndStats(data) {
    if (!data) return;
    scoreValue.textContent = data.score;
    scoreCircle.className = "score-circle";

    let scoreLevel;
    if (data.score >= 80) {
      scoreCircle.classList.add("score-good");
      scoreLevel = "Good";
    } else if (data.score >= 50) {
      scoreCircle.classList.add("score-medium");
      scoreLevel = "Needs improvement";
    } else {
      scoreCircle.classList.add("score-bad");
      scoreLevel = "Poor";
    }
    scoreCircle.setAttribute("aria-label", `Accessibility Score: ${data.score} out of 100, ${scoreLevel}`);

    totalImages.textContent = data.total;
    missingAlt.textContent = data.missing;
    hasAlt.textContent = data.hasAlt;
    decorative.textContent = data.decorative;
  }

  function updateUI(data) {
    if (!data) {
      scoreValue.textContent = "--";
      return;
    }

    currentData = data;
    updateScoreAndStats(data);
    generateAllBtn.style.display = data.missing > 0 ? "block" : "none";

    const missingImages = data.images.filter((img) => img.status === "missing");
    if (missingImages.length > 0) {
      imageListSection.style.display = "block";
      imageList.innerHTML = "";
      missingImages.forEach((img) => {
        imageList.appendChild(buildImageListItem(img));
      });
      const firstItem = imageList.querySelector("li");
      if (firstItem) setActiveListItem(firstItem);
    } else {
      imageListSection.style.display = "none";
    }
    updateBulkActionVisibility();
  }

  function refreshScoreFromPage() {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { type: "GET_RESULTS" }, (r) => {
      if (!chrome.runtime.lastError) updateScoreAndStats(r);
    });
  }

  function getAllListItems() {
    return Array.from(imageList.querySelectorAll("li"));
  }

  function setActiveListItem(li) {
    getAllListItems().forEach((item) => {
      item.classList.remove("item-active");
      item.setAttribute("aria-current", "false");
    });
    if (li) {
      li.classList.add("item-active");
      li.setAttribute("aria-current", "true");
    }
  }

  function getActiveListItem() {
    return (
      imageList.querySelector("li.item-active") ||
      imageList.querySelector("li")
    );
  }

  function getActionableItems() {
    return getAllListItems().filter((li) => {
      const panel = li.querySelector(".review-panel");
      const acceptBtn = panel?.querySelector(".btn-accept");
      return panel && panel.style.display !== "none" && !!acceptBtn;
    });
  }

  function updateBulkActionVisibility() {
    const actionableCount = getActionableItems().length;
    bulkReviewActions.style.display = actionableCount > 0 ? "flex" : "none";
  }

  function generateCurrentItem() {
    const li = getActiveListItem();
    if (!li) return;
    const genBtn = li.querySelector(".btn-gen-single");
    if (!genBtn || genBtn.style.display === "none" || genBtn.disabled) return;
    genBtn.click();
  }

  function acceptCurrentItem() {
    const li = getActiveListItem();
    if (!li) return;
    const acceptBtn = li.querySelector(".review-panel .btn-accept");
    if (!acceptBtn) return;
    acceptBtn.click();
  }

  function rejectCurrentItem() {
    const li = getActiveListItem();
    if (!li) return;
    const rejectBtn = li.querySelector(".review-panel .btn-reject");
    if (!rejectBtn) return;
    rejectBtn.click();
  }

  function acceptAllActionable() {
    const items = getActionableItems();
    if (!items.length) return;
    items.forEach((li) => {
      const src = li.dataset.imgSrc;
      const panel = li.querySelector(".review-panel");
      const textarea = panel.querySelector(".alt-text-edit");
      const decorativeCheck = panel.querySelector(".decorative-check");
      if (!decorativeCheck.checked && !textarea.value.trim()) return;
      acceptAltText(
        src,
        textarea.value.trim(),
        decorativeCheck.checked,
        li,
        true
      );
    });
    setTimeout(() => refreshScoreFromPage(), 300);
  }

  function rejectAllActionable() {
    const items = getActionableItems();
    items.forEach((li) => {
      const panel = li.querySelector(".review-panel");
      rejectAltText(li, panel);
    });
  }

  function handleKeyboardShortcut(e) {
    if (!e.altKey || e.repeat) return;
    const key = e.key.toLowerCase();
    const actionMap = {
      g: () => generateCurrentItem(),
      a: () => (e.shiftKey ? acceptAllActionable() : acceptCurrentItem()),
      r: () => (e.shiftKey ? rejectAllActionable() : rejectCurrentItem()),
    };
    const action = actionMap[key];
    if (!action) return;
    e.preventDefault();
    action();
  }

  // ── Initial load ─────────────────────────────────────────────────────────

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "GET_RESULTS" },
        (response) => {
          if (chrome.runtime.lastError) {
            scoreValue.textContent = "N/A";
            return;
          }
          updateUI(response);
        }
      );
    }
  });

  // ── Re-scan button ───────────────────────────────────────────────────────

  rescanBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "REQUEST_SCAN" },
          (response) => {
            if (!chrome.runtime.lastError) updateUI(response);
          }
        );
      }
    });
  });

  // ── Generate All button ──────────────────────────────────────────────────

  // Promisify sendMessage so we can await it inside an async loop
  function sendMessage(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  generateAllBtn.addEventListener("click", async () => {
    if (!currentData) return;
    const missingImages = currentData.images.filter(
      (img) => img.status === "missing"
    );
    if (missingImages.length === 0) return;

    generateAllBtn.disabled = true;
    generateAllBtn.textContent = "Generating...";
    generateAllBtn.setAttribute("aria-busy", "true");
    generateStatus.style.display = "block";

    for (let i = 0; i < missingImages.length; i++) {
      const img = missingImages[i];
      generateStatus.textContent = `Processing ${i + 1} / ${missingImages.length}…`;

      const li = imageList.querySelector(
        `[data-img-src="${CSS.escape(img.src)}"]`
      );
      if (!li) continue;
      setActiveListItem(li);

      const genBtn = li.querySelector(".btn-gen-single");
      const reviewPanel = li.querySelector(".review-panel");
      genBtn.style.display = "none";

      // Show a loading placeholder while this image is in-flight
      const textarea = reviewPanel.querySelector(".alt-text-edit");
      const reviewActions = reviewPanel.querySelector(".review-actions");
      reviewPanel.style.display = "block";
      reviewPanel.setAttribute("aria-hidden", "false");
      textarea.placeholder = "Generating…";
      textarea.value = "";
      reviewActions.style.display = "none";

      const response = await sendMessage({
        type: "GENERATE_ALT_TEXT",
        imageUrl: img.src,
        context: img.context,
      });

      reviewActions.style.display = "";
      showReviewPanel(
        reviewPanel,
        response || { success: false, error: "No response" }
      );
    }

    generateAllBtn.disabled = false;
    generateAllBtn.textContent = "Generate All Alt Text";
    generateAllBtn.setAttribute("aria-busy", "false");
    generateStatus.textContent = `Done! Review each result below.`;
    setTimeout(() => {
      generateStatus.style.display = "none";
    }, 3000);
  });

  acceptAllBtn.addEventListener("click", acceptAllActionable);
  rejectAllBtn.addEventListener("click", rejectAllActionable);
  document.addEventListener("keydown", handleKeyboardShortcut);
});
