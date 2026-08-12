/**
 * Dark Mode for Google Docs — Content Script
 *
 * Responsibilities:
 *   1. Read persisted state from chrome.storage.local
 *   2. Apply/remove the correct body class for the selected strategy
 *   3. Observe DOM mutations (Docs re-renders on scroll/edit)
 *   4. Handle SPA navigation (URL changes without full reload)
 *   5. Listen for messages from popup to toggle state in real-time
 *   6. Theme top chrome (toolbar/menu) in both strategies
 */

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────
  const STORAGE_KEYS = {
    enabled: 'gdocs_dark_enabled',
    strategy: 'gdocs_dark_strategy', // 'filter' | 'targeted'
  };

  const CLASSES = {
    filter: 'gdocs-dark-filter',
    targeted: 'gdocs-dark-targeted',
  };

  let currentState = {
    enabled: false,
    strategy: 'targeted',
  };

  // ── Rendering Detection ──────────────────────────────────────────
  /**
   * Detect whether Google Docs is using canvas-based rendering.
   * Newer versions render text onto <canvas> tiles instead of DOM spans.
   */
  function isCanvasRendering() {
    return document.querySelector('.kix-canvas-tile-content') !== null;
  }

  // ── Apply / Remove Dark Mode ─────────────────────────────────────
  function applyDarkMode() {
    const body = document.body;
    if (!body) return;

    // Remove both strategy classes first
    body.classList.remove(CLASSES.filter, CLASSES.targeted);

    if (!currentState.enabled) return;

    const strategy = currentState.strategy;

    if (strategy === 'filter') {
      body.classList.add(CLASSES.filter);
    } else if (strategy === 'targeted') {
      body.classList.add(CLASSES.targeted);
    }
  }

  function removeDarkMode() {
    const body = document.body;
    if (!body) return;
    body.classList.remove(CLASSES.filter, CLASSES.targeted);
  }

  // ── Storage Read/Write ───────────────────────────────────────────
  function loadState(callback) {
    chrome.storage.local.get(
      [STORAGE_KEYS.enabled, STORAGE_KEYS.strategy],
      (result) => {
        currentState.enabled =
          result[STORAGE_KEYS.enabled] !== undefined
            ? result[STORAGE_KEYS.enabled]
            : false;
        currentState.strategy =
          result[STORAGE_KEYS.strategy] || 'targeted';

        if (callback) callback();
      }
    );
  }

  function saveState() {
    const data = {};
    data[STORAGE_KEYS.enabled] = currentState.enabled;
    data[STORAGE_KEYS.strategy] = currentState.strategy;
    chrome.storage.local.set(data);
  }

  // ── MutationObserver ─────────────────────────────────────────────
  // Google Docs aggressively re-renders DOM nodes on scroll, edit,
  // and page transitions. We observe the editor container and
  // re-apply our classes if Docs strips them or re-creates the tree.

  let observer = null;

  function startObserver() {
    if (observer) observer.disconnect();

    const target = document.querySelector('.kix-appview-editor') || document.body;

    observer = new MutationObserver((mutations) => {
      // Check if our dark mode classes are still present on body
      if (currentState.enabled) {
        const body = document.body;
        const expectedClass =
          currentState.strategy === 'filter' ? CLASSES.filter : CLASSES.targeted;

        if (!body.classList.contains(expectedClass)) {
          applyDarkMode();
        }
      }
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  // ── SPA Navigation Handler ───────────────────────────────────────
  // Google Docs is a single-page app. When switching documents via
  // links or the browser back/forward buttons, the URL changes but
  // the page doesn't fully reload. We detect this and re-apply state.

  let lastUrl = location.href;

  function onUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Re-load state and re-apply (user may have toggled per-tab)
      loadState(() => {
        if (currentState.enabled) {
          applyDarkMode();
        } else {
          removeDarkMode();
        }
        startObserver();
      });
    }
  }

  // Intercept pushState / replaceState since they don't fire events
  function watchNavigation() {
    // Listen to popstate for back/forward
    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);

    // Intercept pushState / replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      onUrlChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      onUrlChange();
    };
  }

  // ── Message Listener (from popup) ────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GDOCS_DARK_UPDATE') {
      currentState.enabled = message.enabled;
      currentState.strategy = message.strategy;

      if (currentState.enabled) {
        applyDarkMode();
      } else {
        removeDarkMode();
      }

      sendResponse({ success: true });
    }

    if (message.type === 'GDOCS_DARK_GET_STATE') {
      sendResponse({
        enabled: currentState.enabled,
        strategy: currentState.strategy,
        isCanvas: isCanvasRendering(),
      });
    }

    // Return true to indicate async response potential
    return true;
  });

  // ── Storage Change Listener ──────────────────────────────────────
  // Sync state across multiple open Docs tabs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    let needsUpdate = false;

    if (changes[STORAGE_KEYS.enabled]) {
      currentState.enabled = changes[STORAGE_KEYS.enabled].newValue;
      needsUpdate = true;
    }
    if (changes[STORAGE_KEYS.strategy]) {
      currentState.strategy = changes[STORAGE_KEYS.strategy].newValue;
      needsUpdate = true;
    }

    if (needsUpdate) {
      if (currentState.enabled) {
        applyDarkMode();
      } else {
        removeDarkMode();
      }
    }
  });

  // ── Initialization ───────────────────────────────────────────────
  function init() {
    loadState(() => {
      if (currentState.enabled) {
        applyDarkMode();
      }
      startObserver();
    });

    watchNavigation();

    // Also re-apply when the DOM is fully ready (Docs can be slow)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        loadState(() => {
          if (currentState.enabled) applyDarkMode();
          startObserver();
        });
      });
    }
  }

  init();
})();
