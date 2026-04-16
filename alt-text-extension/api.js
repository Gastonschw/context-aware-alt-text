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
          model: data.tamuModel || "gpt-4o",
        });
      }
    );
  });
}

/**
 * Convert an image URL to a base64 data URL by fetching it.
 */
async function imageUrlToBase64(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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
    messages: [
      { role: "system", content: ALT_TEXT_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  };

  const response = await fetch(
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
    const errorText = await response.text();
    throw new Error(`API request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const generatedText = data.choices?.[0]?.message?.content?.trim() || "";

  if (generatedText === "DECORATIVE") {
    return { altText: "", isDecorative: true };
  }

  return { altText: generatedText, isDecorative: false };
}
