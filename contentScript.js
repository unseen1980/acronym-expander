/**
 * @fileoverview Content script for acronym expansion functionality
 */

/**
 * @typedef {Object} TooltipState
 * @property {HTMLDivElement|null} element - The tooltip element
 * @property {number|null} hideTimeout - Timeout ID for hiding the tooltip
 */

/**
 * @typedef {Object} AcronymCache
 * @property {Map<string, string>} expansions - Cache for acronym expansions
 * @property {Map<string, Promise<string>>} pending - Pending expansion requests
 */

class AcronymExpander {
  /** @type {TooltipState} */
  #tooltipState = { element: null, hideTimeout: null };

  /** @type {AcronymCache} */
  #cache = {
    expansions: new Map(),
    pending: new Map(),
  };

  /** @type {HTMLIFrameElement|null} */
  #iframe = null;

  constructor() {
    this.initialize();
  }

  /**
   * Initializes the expander functionality
   */
  async initialize() {
    await this.injectDependencies();
    this.setupMessageHandling();
    this.processPage();
    this.setupEventListeners();
  }

  /**
   * Injects required dependencies (iframe and CSS)
   */
  async injectDependencies() {
    // Inject iframe
    this.#iframe = document.createElement("iframe");
    this.#iframe.style.display = "none";
    this.#iframe.src = chrome.runtime.getURL("iframe.html");
    document.documentElement.appendChild(this.#iframe);

    // Inject CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("tooltip.css");
    document.head.appendChild(link);
  }

  /**
   * Sets up message handling for iframe communication
   */
  setupMessageHandling() {
    window.addEventListener("message", (event) => {
      if (event.source !== this.#iframe?.contentWindow) return;

      const { type, data } = event.data;
      if (type === "EXPANSION_RESULT") {
        const { acronym, expansion } = data;
        this.#cache.expansions.set(acronym, expansion);

        // Resolve pending promises
        const resolver = this.#cache.pending.get(acronym);
        if (resolver) {
          resolver(expansion);
          this.#cache.pending.delete(acronym);
        }
      }
    });
  }

  /**
   * Processes the page content to identify and mark acronyms
   * @param {Element} [root=document.body] - Root element to process
   */
  async processPage(root = document.body) {
    const allTermsFound = new Map();

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        if (
          parent.classList.contains("acronym-expander") ||
          ["script", "style", "code", "pre"].includes(
            parent.tagName.toLowerCase()
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    // Process nodes in batches for better performance
    const BATCH_SIZE = 50;
    for (let i = 0; i < textNodes.length; i += BATCH_SIZE) {
      const batch = textNodes.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (node) => {
          const result = await this.processTextNode(node);
          // Debug log
          if (result?.terms?.size > 0) {
            console.debug("Found terms:", Array.from(result.terms));
            result.terms.forEach((term) => {
              if (!allTermsFound.has(term)) {
                allTermsFound.set(term, result.context);
              }
            });
          }
        })
      );
    }

    // Single consolidated log at the end
    if (allTermsFound.size > 0) {
      console.group(
        "%c🔍 Tech Terms Found on Page",
        "color: #4285f4; font-size: 14px; font-weight: bold;"
      );
      console.log(
        "%cTotal unique terms:",
        "font-weight: bold",
        allTermsFound.size
      );
      allTermsFound.forEach((context, term) => {
        console.log(
          `%c${term}%c: "${context.trim()}"`,
          "color: #4285f4; font-weight: bold",
          "color: #666"
        );
      });
      console.groupEnd();
    }
  }

  /**
   * Processes a single text node to identify acronyms
   * @param {Text} node - Text node to process
   * @returns {Object} Object containing found terms and their context
   */
  async processTextNode(node) {
    const text = node.textContent;
    if (!text || text.length < 2) return { terms: new Set(), context: "" };

    /**
     * Breaking it down:
     * \b                     // Word boundary
     * (?:                    // Start non-capturing group for all alternatives
     *   [A-Z]{2,}           // 2+ uppercase letters (basic acronyms like API, CPU)
     *   (?:\d*[A-Z]*)*      // Optional numbers and more letters (like IPv6, PS5)
     *   |                    // OR
     *   i[A-Z][a-z]+        // Apple-style (iOS, iPhone, iPad)
     *   |                    // OR
     *   e[A-Z][a-z]+        // Electronic terms (eMail, eBook)
     *   |                    // OR
     *   (?:Node|Web|React|Vue|Next)  // Common tech frameworks
     *   \.?(?:js|JS)?       // Optional .js suffix
     * )
     * \b                     // Word boundary
     * /g                     // Global flag
     */
    const acronymPattern =
      /\b(?:[A-Z]{2,}(?:\d*[A-Z]*)*|i[A-Z][a-z]+|e[A-Z][a-z]+|(?:Node|Web|React|Vue|Next)\.?(?:js|JS)?)\b/g;
    let match;
    let lastIndex = 0;
    const fragments = [];
    const termsFound = new Set();
    let contextText = "";

    while ((match = acronymPattern.exec(text)) !== null) {
      const acronym = match[0];
      if (this.shouldSkipAcronym(acronym)) continue;

      termsFound.add(acronym);
      contextText = text.slice(
        Math.max(0, match.index - 50),
        Math.min(text.length, match.index + acronym.length + 50)
      );

      if (match.index > lastIndex) {
        fragments.push(
          document.createTextNode(text.slice(lastIndex, match.index))
        );
      }

      const span = document.createElement("span");
      span.className = "acronym-expander";
      span.textContent = acronym;
      span.dataset.acronym = acronym;
      fragments.push(span);

      lastIndex = match.index + acronym.length;
    }

    if (lastIndex < text.length) {
      fragments.push(document.createTextNode(text.slice(lastIndex)));
    }

    if (fragments.length > 1) {
      const container = document.createElement("span");
      fragments.forEach((fragment) => container.appendChild(fragment));
      node.replaceWith(container);
    }

    return { terms: termsFound, context: contextText };
  }

  /**
   * Determines if an acronym should be skipped
   * @param {string} acronym - Acronym to check
   * @returns {boolean} True if acronym should be skipped
   */
  shouldSkipAcronym(acronym) {
    // Updated common words to only skip non-tech terms
    const nonTechWords = new Set([
      "USA",
      "UK",
      "EU",
      "UN", // Geographic/Political
      "Mr",
      "Mrs",
      "Ms",
      "Dr", // Titles
      "AM",
      "PM", // Time
    ]);

    // Skip if it's a common non-tech abbreviation or too long
    return nonTechWords.has(acronym) || acronym.length > 12;
  }

  /**
   * Sets up event listeners for acronym interaction
   */
  setupEventListeners() {
    // Use event delegation for better performance
    document.addEventListener("mouseover", this.handleMouseOver.bind(this));
    document.addEventListener("mouseout", this.handleMouseOut.bind(this));

    // Handle settings changes
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "SETTINGS_CHANGED") {
        this.handleSettingsChange(message.data);
      }
    });

    // Handle page mutations
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.processPage(node);
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Handles mouse over events on acronyms
   * @param {MouseEvent} event - Mouse event
   */
  async handleMouseOver(event) {
    const target = event.target;
    if (!target.classList?.contains("acronym-expander")) return;

    const acronym = target.dataset.acronym;
    if (!acronym) return;

    clearTimeout(this.#tooltipState.hideTimeout);

    let expansion = this.#cache.expansions.get(acronym);
    if (!expansion) {
      try {
        // Check for pending request
        let pending = this.#cache.pending.get(acronym);
        if (!pending) {
          pending = new Promise((resolve) => {
            this.#iframe?.contentWindow?.postMessage(
              { type: "EXPAND_ACRONYM", data: { acronym } },
              "*"
            );
            this.#cache.pending.set(acronym, resolve);
          });
        }
        expansion = await pending;

        // Only show if we got a valid expansion
        if (expansion && expansion.trim()) {
          this.showTooltip(expansion, target);
        }
      } catch (error) {
        console.error("Error handling mouseover:", error);
      }
    } else if (expansion.trim()) {
      this.showTooltip(expansion, target);
    }
  }

  /**
   * Shows the tooltip with expansion text
   * @param {string} text - Text to display
   * @param {HTMLElement} target - Target element
   */
  showTooltip(text, target) {
    if (!this.#tooltipState.element) {
      this.#tooltipState.element = document.createElement("div");
      this.#tooltipState.element.id = "acronym-tooltip";
      document.body.appendChild(this.#tooltipState.element);
    }

    const tooltip = this.#tooltipState.element;
    tooltip.textContent = text;
    tooltip.style.display = "block";

    // Position tooltip
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.bottom + 5}px`;
  }

  /**
   * Handles mouse out events
   */
  handleMouseOut() {
    if (this.#tooltipState.element) {
      this.#tooltipState.hideTimeout = window.setTimeout(() => {
        if (this.#tooltipState.element) {
          this.#tooltipState.element.style.display = "none";
        }
      }, 200);
    }
  }

  /**
   * Handles settings changes
   * @param {Object} settings - New settings
   */
  handleSettingsChange(settings) {
    if (!settings.extensionEnabled) {
      document.querySelectorAll(".acronym-expander").forEach((el) => {
        el.classList.remove("acronym-expander");
      });
    } else {
      this.processPage();
    }
  }
}

const expander = new AcronymExpander();
