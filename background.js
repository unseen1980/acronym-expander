/**
 * @fileoverview Background service worker for acronym extraction
 */

/** @type {import('@google/generative-ai').GenerativeModel|null} */
let session = null;

/**
 * @typedef {Object} AcronymData
 * @property {string} acronym - The acronym
 * @property {string} expansion - The expanded form
 * @property {string} description - Brief description
 */

// Message listener with error handling and debouncing
const messageHandler = async (message, sender, sendResponse) => {
  if (message.type !== "EXTRACT_ACRONYMS") return false;

  try {
    const acronyms = await extractAcronymsWithGemini(message.text);
    sendResponse({ acronyms });
  } catch (error) {
    console.error("Error extracting acronyms:", error);
    sendResponse({ acronyms: [] });
  }
  return true;
};

chrome.runtime.onMessage.addListener(messageHandler);

/**
 * Extracts acronyms using Gemini AI
 * @param {string} text - Input text to analyze
 * @returns {Promise<AcronymData[]>} Array of acronym data
 */
async function extractAcronymsWithGemini(text) {
  try {
    if (!session) {
      session = await window.ai.languageModel.create({
        temperature: 0,
        topK: 1,
        cache: true,
      });
    }

    const prompt = `
      Extract all acronyms and abbreviations from the following text. For each acronym, provide:
      - The acronym itself
      - Its expansion
      - A brief 5-10 word description

      Format: JSON array with keys: acronym, expansion, description

      Text: ${text}
    `.trim();

    const response = await session.prompt(prompt);
    return JSON.parse(response);
  } catch (error) {
    console.error("Extraction error:", error);
    return [];
  }
}
