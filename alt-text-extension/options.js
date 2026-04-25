// Settings page logic

document.addEventListener("DOMContentLoaded", () => {
  const serverUrl = document.getElementById("serverUrl");
  const customUrlGroup = document.getElementById("customUrlGroup");
  const customUrl = document.getElementById("customUrl");
  const apiKey = document.getElementById("apiKey");
  const modelName = document.getElementById("modelName");
  const saveBtn = document.getElementById("saveBtn");
  const status = document.getElementById("status");
  const fetchModelsBtn = document.getElementById("fetchModelsBtn");
  const modelsList = document.getElementById("modelsList");

  // Show/hide custom URL field
  serverUrl.addEventListener("change", () => {
    const isCustom = serverUrl.value === "custom";
    customUrlGroup.style.display = isCustom ? "block" : "none";
    customUrlGroup.setAttribute("aria-hidden", isCustom ? "false" : "true");
  });

  // Load saved settings
  chrome.storage.local.get(
    ["tamuServerUrl", "tamuApiKey", "tamuModel"],
    (data) => {
      if (data.tamuServerUrl) {
        const option = serverUrl.querySelector(
          `option[value="${data.tamuServerUrl}"]`
        );
        if (option) {
          serverUrl.value = data.tamuServerUrl;
        } else {
          serverUrl.value = "custom";
          customUrlGroup.style.display = "block";
          customUrlGroup.setAttribute("aria-hidden", "false");
          customUrl.value = data.tamuServerUrl;
        }
      }
      if (data.tamuApiKey) apiKey.value = data.tamuApiKey;
      if (data.tamuModel) modelName.value = data.tamuModel;
    }
  );

  // Fetch available models
  fetchModelsBtn.addEventListener("click", () => {
    const server =
      serverUrl.value === "custom" ? customUrl.value.trim() : serverUrl.value;
    const key = apiKey.value.trim();

    if (!server || !key) {
      status.textContent = "Please fill in server and API key first.";
      status.style.color = "#e53935";
      return;
    }

    fetchModelsBtn.disabled = true;
    fetchModelsBtn.textContent = "Loading...";
    fetchModelsBtn.setAttribute("aria-busy", "true");
    modelsList.style.display = "none";

    chrome.runtime.sendMessage(
      { type: "FETCH_MODELS", serverUrl: server, apiKey: key },
      (response) => {
        fetchModelsBtn.disabled = false;
        fetchModelsBtn.textContent = "Fetch Models";
        fetchModelsBtn.setAttribute("aria-busy", "false");

        if (response?.success && response.models.length > 0) {
          modelsList.style.display = "block";
          modelsList.innerHTML = "";

          const select = document.createElement("select");
          select.style.width = "100%";
          select.style.padding = "8px";
          select.style.borderRadius = "6px";
          select.style.border = "1px solid #ddd";
          select.style.fontSize = "13px";
          select.setAttribute("aria-label", "Select an available model");

          response.models.forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m.id;
            opt.textContent = m.name || m.id;
            select.appendChild(opt);
          });

          // Pre-select current model if it exists
          if (modelName.value) {
            select.value = modelName.value;
          }

          select.addEventListener("change", () => {
            modelName.value = select.value;
          });

          modelsList.appendChild(select);
          status.textContent = `Found ${response.models.length} models.`;
          status.style.color = "#43a047";
        } else {
          status.textContent =
            response?.error || "No models found. Check your server and API key.";
          status.style.color = "#e53935";
        }
      }
    );
  });

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
        tamuModel: modelName.value.trim() || "gpt-4o-mini",
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
