// Shared utilities for all DailyJamm games
window.DJUtils = (function () {
  'use strict';

  /** Returns today's date string in America/Chicago timezone (YYYY-MM-DD) */
  function getChicagoDate() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  }

  /** Returns ms timestamp of next Chicago midnight */
  function getChicagoMidnight() {
    const now = new Date();
    const chi = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const tomorrow = new Date(chi);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return Date.now() + (tomorrow - chi);
  }

  /** Load JSON from localStorage; return defaults on missing or corrupt data */
  function loadJSON(key, defaults) {
    try { return JSON.parse(localStorage.getItem(key)) || defaults; }
    catch (e) { return defaults; }
  }

  /** Save data as JSON to localStorage */
  function saveJSON(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  /**
   * Copy text to clipboard and show "Copied!" feedback on a button.
   * Restores resetLabel after 2 seconds.
   */
  function clipboardShare(text, btnEl, resetLabel) {
    navigator.clipboard.writeText(text).then(function () {
      btnEl.textContent = 'Copied!';
      setTimeout(function () { btnEl.textContent = resetLabel; }, 2000);
    }).catch(function () {
      // Clipboard API unavailable — silent fallback
    });
  }

  return { getChicagoDate, getChicagoMidnight, loadJSON, saveJSON, clipboardShare };
})();
