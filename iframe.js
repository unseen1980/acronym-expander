/**
 * @fileoverview Handles acronym expansion requests in an isolated iframe context
 */

/** @type {import('@google/generative-ai').GenerativeModel|null} */
let aiSession = null;

/**
 * Handles incoming messages from the parent window
 * @param {MessageEvent} event - The message event
 */
window.addEventListener("message", async (event) => {
  if (event.source !== window.parent) return;

  const { type, data } = event.data;

  if (type === "EXPAND_ACRONYM" && data?.acronym) {
    try {
      if (!aiSession) {
        aiSession = await window.ai.languageModel.create({
          temperature: 0.2,
          topK: 3,
          cache: true,
        });
      }

      const prompt = `You are an expert in explaining technology-related terms to people with limited technical knowledge. Analyze this term: "${data.acronym}"

If it's not a technology-related term, respond exactly with: "Not a tech term"

If it is technology-related, respond in this exact format:
[Full Name]: [Simple 5-15 word explanation]

Examples:
RAM: Random Access Memory: Computer's temporary memory for running programs
CPU: Central Processing Unit: Main processor that runs computer programs
PS5: PlayStation 5: Sony's gaming console for playing video games

Keep explanations simple and clear.`;

      const response = await aiSession.prompt(prompt);
      const result = response.trim();

      if (result.toLowerCase().includes("not a tech term")) {
        sendExpansionResult(data.acronym, "");
      } else {
        sendExpansionResult(data.acronym, result);
      }
    } catch (error) {
      console.error("Error expanding acronym:", error);
      sendExpansionResult(data.acronym, "");
    }
  }
});

/**
 * Sends expansion results back to the parent window
 * @param {string} acronym - The original acronym
 * @param {string} expansion - The expanded definition
 */
function sendExpansionResult(acronym, expansion) {
  window.parent.postMessage(
    {
      type: "EXPANSION_RESULT",
      data: {
        acronym,
        expansion: expansion.trim(),
      },
    },
    "*"
  );
}
