/**
 * @fileoverview Handles extension settings and user preferences
 */

/**
 * @typedef {Object} ExtensionSettings
 * @property {boolean} extensionEnabled - Whether the extension is enabled
 */

/**
 * Initializes the options page functionality
 */
function initializeOptions() {
  const checkbox = document.getElementById("enable-extension");
  if (!checkbox) return;

  loadSettings(checkbox);
  setupEventListeners(checkbox);
}

/**
 * Loads saved settings from storage
 * @param {HTMLInputElement} checkbox - The enable/disable checkbox element
 */
function loadSettings(checkbox) {
  chrome.storage.sync.get(
    { extensionEnabled: true },
    /** @param {ExtensionSettings} data */
    (data) => {
      console.log("Retrieved extensionEnabled:", data.extensionEnabled);
      checkbox.checked = data.extensionEnabled;
    }
  );
}

/**
 * Sets up event listeners for settings changes
 * @param {HTMLInputElement} checkbox - The enable/disable checkbox element
 */
function setupEventListeners(checkbox) {
  checkbox.addEventListener("change", () => {
    chrome.storage.sync.set({ extensionEnabled: checkbox.checked }, () => {
      console.log("Saved extensionEnabled:", checkbox.checked);
      // Notify content scripts of the change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: "SETTINGS_CHANGED",
              data: { extensionEnabled: checkbox.checked },
            });
          }
        });
      });
    });
  });
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initializeOptions);
