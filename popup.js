/**
 * Dark Mode for Google Docs — Popup Script
 *
 * Reads and writes state to chrome.storage.local.
 * Sends messages to the active Docs tab's content script
 * for immediate application without requiring a reload.
 */

(function () {
  'use strict';

  // ── Storage Keys (must match content.js) ──────────────────────────
  const STORAGE_KEYS = {
    enabled: 'gdocs_dark_enabled',
    strategy: 'gdocs_dark_strategy',
  };

  // ── DOM Elements ──────────────────────────────────────────────────
  const toggleDark = document.getElementById('toggleDark');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const cardTargeted = document.getElementById('cardTargeted');
  const cardFilter = document.getElementById('cardFilter');
  const canvasNotice = document.getElementById('canvasNotice');
  const imageNotice = document.getElementById('imageNotice');
  const imageNoticeText = document.getElementById('imageNoticeText');
  const notDocs = document.getElementById('notDocs');
  const mainContent = document.getElementById('mainContent');
  const strategyRadios = document.querySelectorAll('input[name="strategy"]');

  // ── Helpers ───────────────────────────────────────────────────────

  function updateUI(state) {
    // Toggle
    toggleDark.checked = state.enabled;
    statusDot.classList.toggle('active', state.enabled);
    statusText.textContent = state.enabled ? 'Dark mode on' : 'Dark mode off';

    // Strategy
    strategyRadios.forEach((radio) => {
      radio.checked = radio.value === state.strategy;
    });
    cardTargeted.classList.toggle('selected', state.strategy === 'targeted');
    cardFilter.classList.toggle('selected', state.strategy === 'filter');

    // Image notice — update text based on strategy
    if (state.strategy === 'filter') {
      imageNoticeText.textContent =
        'Filter mode inverts the entire editor — images will appear inverted. Docs renders them as canvas pixels, so CSS cannot selectively un-invert.';
    } else {
      imageNoticeText.textContent =
        'Targeted mode keeps images true-color. Only canvas-rendered text tiles use filter inversion.';
    }

    // Canvas notice
    if (state.isCanvas && state.strategy === 'targeted') {
      canvasNotice.classList.remove('hidden');
    } else {
      canvasNotice.classList.add('hidden');
    }
  }

  function getState() {
    return {
      enabled: toggleDark.checked,
      strategy: document.querySelector('input[name="strategy"]:checked')?.value || 'targeted',
    };
  }

  function persistAndNotify() {
    const state = getState();
    const data = {};
    data[STORAGE_KEYS.enabled] = state.enabled;
    data[STORAGE_KEYS.strategy] = state.strategy;

    chrome.storage.local.set(data);

    // Update status indicator
    statusDot.classList.toggle('active', state.enabled);
    statusText.textContent = state.enabled ? 'Dark mode on' : 'Dark mode off';

    // Update card selection
    cardTargeted.classList.toggle('selected', state.strategy === 'targeted');
    cardFilter.classList.toggle('selected', state.strategy === 'filter');

    // Update image notice
    if (state.strategy === 'filter') {
      imageNoticeText.textContent =
        'Filter mode inverts the entire editor — images will appear inverted. Docs renders them as canvas pixels, so CSS cannot selectively un-invert.';
    } else {
      imageNoticeText.textContent =
        'Targeted mode keeps images true-color. Only canvas-rendered text tiles use filter inversion.';
    }

    // Notify active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('docs.google.com/document')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'GDOCS_DARK_UPDATE',
          enabled: state.enabled,
          strategy: state.strategy,
        });
      }
    });
  }

  // ── Event Listeners ───────────────────────────────────────────────

  toggleDark.addEventListener('change', persistAndNotify);

  strategyRadios.forEach((radio) => {
    radio.addEventListener('change', persistAndNotify);
  });

  // ── Initialization ────────────────────────────────────────────────

  // Check if the active tab is a Google Docs document
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const isDocsTab =
      tab && tab.url && tab.url.startsWith('https://docs.google.com/document/');

    if (!isDocsTab) {
      notDocs.classList.add('visible');
      mainContent.classList.add('hidden');
      return;
    }

    // Load saved state
    chrome.storage.local.get(
      [STORAGE_KEYS.enabled, STORAGE_KEYS.strategy],
      (result) => {
        const state = {
          enabled: result[STORAGE_KEYS.enabled] || false,
          strategy: result[STORAGE_KEYS.strategy] || 'targeted',
          isCanvas: false,
        };

        updateUI(state);

        // Also query the content script for canvas detection status
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'GDOCS_DARK_GET_STATE' },
          (response) => {
            if (chrome.runtime.lastError) {
              // Content script not yet injected — that's ok
              return;
            }
            if (response) {
              state.isCanvas = response.isCanvas;
              updateUI({ ...state, ...response });
            }
          }
        );
      }
    );
  });
})();
