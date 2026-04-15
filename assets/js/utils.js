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

  /**
   * Render a guess-distribution bar chart into a container using DOM methods.
   *
   * dist  — array of counts. All elements except the last are win-guess slots
   *         (index 0 = won on guess 1, etc.). The LAST element is always losses.
   *         e.g. Themedle: 7 elements [g1,g2,g3,g4,g5,g6,losses]
   *              Spelldle:  9 elements [g1..g8,losses]
   *
   * Each bar is green→yellow→red as guess number rises; losses are grey.
   * The widest bar fills 100%; others scale proportionally.
   */
  function renderGuessDist(containerId, dist) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.textContent = '';

    const wins  = dist.length - 1; // number of win slots
    const max   = Math.max.apply(null, dist.concat([1]));
    // Colour ramp: early guesses green → mid yellow → late red → grey for ✗
    const RAMP  = ['#4ade80','#86efac','#fbbf24','#fb923c','#f87171','#ef4444','#dc2626','#b91c1c'];

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;' +
                        'letter-spacing:0.07em;margin:14px 0 8px;padding-top:14px;border-top:1px solid #1f2937';
    hdr.textContent = 'Guess Distribution';
    el.appendChild(hdr);

    dist.forEach(function (count, i) {
      var isLoss  = i === wins;
      var label   = isLoss ? '✗' : String(i + 1);
      var rampIdx = Math.min(i, RAMP.length - 1);
      var color   = isLoss ? '#4b5563' : RAMP[rampIdx];
      var pct     = Math.round((count / max) * 100);

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px';

      var lbl = document.createElement('div');
      lbl.style.cssText = 'width:16px;text-align:right;font-size:12px;font-weight:800;flex-shrink:0;color:' +
                          (isLoss ? '#6b7280' : '#d1d5db');
      lbl.textContent = label;

      var track = document.createElement('div');
      track.style.cssText = 'flex:1;background:#111827;border-radius:4px;height:22px;overflow:hidden';

      var bar = document.createElement('div');
      bar.style.cssText = 'height:100%;border-radius:4px;display:flex;align-items:center;padding:0 7px;' +
                          'font-size:11px;font-weight:800;color:#0b1220;background:' + color + ';' +
                          'min-width:' + (count > 0 ? '26px' : '0') + ';width:' + pct + '%;' +
                          'transition:width 0.5s ease';
      if (count > 0) bar.textContent = String(count);

      track.appendChild(bar);
      row.appendChild(lbl);
      row.appendChild(track);
      el.appendChild(row);
    });
  }

  return { getChicagoDate, getChicagoMidnight, loadJSON, saveJSON, clipboardShare, setStatRows, renderGuessDist };
})();
