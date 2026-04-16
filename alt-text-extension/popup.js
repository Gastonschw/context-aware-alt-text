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
  const apiWarning = document.getElementById("apiWarning");
  const openSettingsLink = document.getElementById("openSettingsLink");
  const settingsLink = document.getElementById("settingsLink");

  let currentData = null;

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

  function updateUI(data) {
    if (!data) {
      scoreValue.textContent = "--";
      return;
    }

    currentData = data;

    scoreValue.textContent = data.score;
    scoreCircle.className = "score-circle";
    if (data.score >= 80) {
      scoreCircle.classList.add("score-good");
    } else if (data.score >= 50) {
      scoreCircle.classList.add("score-medium");
    } else {
      scoreCircle.classList.add("score-bad");
    }

    totalImages.textContent = data.total;
    missingAlt.textContent = data.missing;
    hasAlt.textContent = data.hasAlt;
    decorative.textContent = data.decorative;

    // Show/hide generate button based on missing count
    generateAllBtn.style.display = data.missing > 0 ? "block" : "none";

    const missingImages = data.images.filter((img) => img.status === "missing");
    if (missingImages.length > 0) {
      imageListSection.style.display = "block";
      imageList.innerHTML = "";

      missingImages.forEach((img) => {
        const li = document.createElement("li");

        const thumbnail = document.createElement("img");
        thumbnail.src = img.src;
        thumbnail.alt = "Thumbnail preview";
        thumbnail.onerror = () => {
          thumbnail.style.display = "none";
        };

        const info = document.createElement("div");
        info.className = "img-info";

        const srcSpan = document.createElement("span");
        srcSpan.className = "img-src";
        const filename = img.src.split("/").pop().split("?")[0] || "unknown";
        srcSpan.textContent = filename;
        info.appendChild(srcSpan);

        if (img.context) {
          const contextSpan = document.createElement("span");
          contextSpan.className = "img-context";
          contextSpan.textContent =
            img.context.substring(0, 80) +
            (img.context.length > 80 ? "..." : "");
          info.appendChild(contextSpan);
        }

        const sizeSpan = document.createElement("span");
        sizeSpan.className = "img-src";
        sizeSpan.textContent = `${img.width} x ${img.height}px`;
        info.appendChild(sizeSpan);

        li.appendChild(thumbnail);
        li.appendChild(info);
        imageList.appendChild(li);
      });
    } else {
      imageListSection.style.display = "none";
    }
  }

  // Request results from content script
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

  // Re-scan button
  rescanBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "REQUEST_SCAN" },
          (response) => {
            if (!chrome.runtime.lastError) {
              updateUI(response);
            }
          }
        );
      }
    });
  });

  // Generate All button
  generateAllBtn.addEventListener("click", () => {
    if (!currentData) return;

    const missingImages = currentData.images.filter(
      (img) => img.status === "missing"
    );
    if (missingImages.length === 0) return;

    generateAllBtn.disabled = true;
    generateAllBtn.textContent = "Generating...";
    generateStatus.style.display = "block";
    generateStatus.textContent = `Processing 0 / ${missingImages.length} images...`;

    chrome.runtime.sendMessage(
      {
        type: "GENERATE_ALL_ALT_TEXT",
        images: missingImages,
      },
      (response) => {
        generateAllBtn.disabled = false;
        generateAllBtn.textContent = "Generate All Alt Text";

        if (response?.success) {
          const succeeded = response.results.filter((r) => r.success).length;
          const failed = response.results.filter((r) => !r.success).length;
          generateStatus.textContent = `Done! ${succeeded} generated, ${failed} failed.`;

          // Inject the generated alt texts into the page
          chrome.tabs.query(
            { active: true, currentWindow: true },
            (tabs) => {
              if (!tabs[0]) return;
              for (const result of response.results) {
                if (result.success && !result.isDecorative) {
                  chrome.tabs.sendMessage(tabs[0].id, {
                    type: "INJECT_ALT_TEXT",
                    src: result.src,
                    altText: result.altText,
                  });
                }
              }
              // Refresh the UI after injection
              setTimeout(() => {
                chrome.tabs.sendMessage(
                  tabs[0].id,
                  { type: "GET_RESULTS" },
                  (r) => {
                    if (!chrome.runtime.lastError) updateUI(r);
                  }
                );
              }, 500);
            }
          );
        } else {
          generateStatus.textContent = `Error: ${response?.error || "Unknown error"}`;
        }
      }
    );
  });
});
