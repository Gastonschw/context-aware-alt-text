// Settings page logic

document.addEventListener("DOMContentLoaded", () => {
  const serverUrl = document.getElementById("serverUrl");
  const customUrlGroup = document.getElementById("customUrlGroup");
  const customUrl = document.getElementById("customUrl");
  const apiKey = document.getElementById("apiKey");
  const modelName = document.getElementById("modelName");
  const saveBtn = document.getElementById("saveBtn");
  const status = document.getElementById("status");

  // Show/hide custom URL field
  serverUrl.addEventListener("change", () => {
    customUrlGroup.style.display =
      serverUrl.value === "custom" ? "block" : "none";
  });

  // Load saved settings
  chrome.storage.local.get(
    ["tamuServerUrl", "tamuApiKey", "tamuModel", "tamuCustomUrl"],
    (data) => {
      if (data.tamuServerUrl) {
        // Check if it matches a preset option
        const option = serverUrl.querySelector(
          `option[value="${data.tamuServerUrl}"]`
        );
        if (option) {
          serverUrl.value = data.tamuServerUrl;
        } else {
          serverUrl.value = "custom";
          customUrlGroup.style.display = "block";
          customUrl.value = data.tamuServerUrl;
        }
      }
      if (data.tamuApiKey) apiKey.value = data.tamuApiKey;
      if (data.tamuModel) modelName.value = data.tamuModel;
    }
  );

  // Save settings
  saveBtn.addEventListener("click", () => {
    const server =
      serverUrl.value === "custom" ? customUrl.value.trim() : serverUrl.value;

    if (!server) {
      status.textContent = "Please select or enter a server URL.";
      status.style.color = "#e53935";
      return;
    }

    if (!apiKey.value.trim()) {
      status.textContent = "Please enter an API key.";
      status.style.color = "#e53935";
      return;
    }

    chrome.storage.local.set(
      {
        tamuServerUrl: server,
        tamuApiKey: apiKey.value.trim(),
        tamuModel: modelName.value.trim() || "gpt-4o",
      },
      () => {
        status.textContent = "Settings saved!";
        status.style.color = "#43a047";
        setTimeout(() => {
          status.textContent = "";
        }, 3000);
      }
    );
  });
});
