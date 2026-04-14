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

  /**
   * Safely render a list of stat rows into a container using DOM methods.
   * Each row: { label: string, value: string|number, color?: string }
   * Avoids innerHTML with user-derived data.
   */
  function setStatRows(containerId, rows) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.textContent = '';
    rows.forEach(function (r) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1f2937';
      const lbl = document.createElement('span');
      lbl.style.cssText = 'color:#9ca3af;font-size:13px';
      lbl.textContent = r.label;
      const val = document.createElement('span');
      val.style.cssText = 'font-weight:800;font-size:15px;color:' + (r.color || '#fff');
      val.textContent = String(r.value);
      row.appendChild(lbl);
      row.appendChild(val);
      el.appendChild(row);
    });
  }

  return { getChicagoDate, getChicagoMidnight, loadJSON, saveJSON, clipboardShare, setStatRows };
})();
