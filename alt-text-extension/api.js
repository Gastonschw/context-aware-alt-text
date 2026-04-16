// TAMU API integration for alt text generation
// Uses OpenAI-compatible chat completions endpoint with vision support

const ALT_TEXT_SYSTEM_PROMPT = `You are an accessibility expert that generates alt text for images on web pages. Your job is to create concise, descriptive alt text that conveys the meaning and purpose of the image.

Rules:
- Keep alt text under 125 characters when possible.
- Describe what the image shows, not what it is ("a golden retriever playing fetch" not "an image of a dog").
- Include relevant context from the surrounding text when it helps clarify the image's purpose.
- If the image appears to be purely decorative (borders, spacers, background patterns), respond with exactly: DECORATIVE
- Do not start with "Image of" or "Picture of".
- Be specific: mention colors, actions, text in the image, and key details.
- Consider the context of how the image is used on the page.`;

/**
 * Load saved API settings from chrome.storage
 */
async function getApiSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["tamuServerUrl", "tamuApiKey", "tamuModel"],
      (data) => {
        resolve({
          baseUrl: data.tamuServerUrl || "https://chat-api.tamu.ai",
          apiKey: data.tamuApiKey || "",
          model: data.tamuModel || "gpt-4o-mini",
        });
      }
    );
  });
}

/**
 * Convert an image URL to a base64 data URL.
 * Handles data: URIs directly (no fetch needed) and retries on transient errors.
 */
async function imageUrlToBase64(url) {
  // Already a data URI — extract and return as-is
  if (url.startsWith("data:")) {
    return url;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status})`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetch with automatic retry on rate-limit (429) and server errors (5xx).
 */
async function fetchWithRetry(url, options, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        lastError = response;
        continue;
      }
    }
    return response;
  }
  return lastError;
}

function apiErrorMessage(status, body) {
  switch (status) {
    case 401: return "Invalid API key. Please check your settings.";
    case 403: return "Access denied. Check your API key permissions.";
    case 429: return "Rate limited — please wait a moment and try again.";
    case 500:
    case 502:
    case 503: return "API server error. Please try again later.";
    default:  return `API request failed (${status}): ${body}`;
  }
}

/**
 * Fetch available models from the TAMU API.
 */
async function fetchAvailableModels(serverUrl, apiKey) {
  const modelsUrl = `${serverUrl}/openai/models`;
  const response = await fetch(modelsUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models (${response.status})`);
  }
  const payload = await response.json();
  const modelsData = payload.data || [];
  return modelsData.map((m) => ({
    id: m.id || m.openai?.id,
    name: m.name || m.openai?.name || m.id,
  }));
}

/**
 * Generate alt text for an image using the TAMU API.
 * @param {string} imageUrl - The image URL
 * @param {string} surroundingContext - Text surrounding the image on the page
 * @returns {Promise<{altText: string, isDecorative: boolean}>}
 */
async function generateAltText(imageUrl, surroundingContext) {
  const settings = await getApiSettings();

  if (!settings.apiKey) {
    throw new Error(
      "API key not configured. Please set your TAMU API key in the extension settings."
    );
  }

  // Build the user message with image and context
  let userContent = [];

  // Add the image
  try {
    // Try to convert to base64 for cross-origin compatibility
    const dataUrl = await imageUrlToBase64(imageUrl);
    const [header, base64Data] = dataUrl.split(",");
    const mediaType = header.match(/:(.*?);/)[1];
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${mediaType};base64,${base64Data}`,
      },
    });
  } catch {
    // Fall back to direct URL if base64 conversion fails
    userContent.push({
      type: "image_url",
      image_url: {
        url: imageUrl,
      },
    });
  }

  // Add the text prompt with context
  let prompt = "Generate alt text for this image.";
  if (surroundingContext) {
    prompt += `\n\nSurrounding page context: "${surroundingContext}"`;
  }
  userContent.push({
    type: "text",
    text: prompt,
  });

  const requestBody = {
    model: settings.model,
    max_tokens: 300,
    temperature: 0,
    stream: false,   // explicitly disable SSE streaming
    messages: [
      { role: "system", content: ALT_TEXT_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  };

  const response = await fetchWithRetry(
    `${settings.baseUrl}/api/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(apiErrorMessage(response.status, errorText));
  }

  // Some servers return SSE format ("data: {...}\n\ndata: [DONE]") even when
  // stream:false is set. Parse the first "data: " chunk as a fallback.
  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    const firstChunk = responseText.split("\n").find((l) => l.startsWith("data: ") && !l.includes("[DONE]"));
    if (!firstChunk) throw new Error("Unreadable response from API server.");
    data = JSON.parse(firstChunk.slice("data: ".length));
  }

  const generatedText = data.choices?.[0]?.message?.content?.trim() || "";

  if (generatedText === "DECORATIVE") {
    return { altText: "", isDecorative: true };
  }

  return { altText: generatedText, isDecorative: false };
}
