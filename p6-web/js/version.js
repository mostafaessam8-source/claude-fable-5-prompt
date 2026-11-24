/* P6 Web – version stamp. Bump VERSION for each release; tools/build-offline.js stamps COMMIT / OFFLINE into the single-file offline copy. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  P6.VERSION = '2.8.0'; P6.BUILD_DATE = '2026-11-24'; P6.COMMIT = 'dev'; P6.OFFLINE = false;
  P6.versionName = () => 'P6 Web – Schedule Studio v' + P6.VERSION + (P6.COMMIT && P6.COMMIT !== 'dev' ? ' (' + P6.COMMIT + ')' : '') + (P6.OFFLINE ? ' · Offline' : '');
  P6.offlineFile = () => 'P6-Web-v' + P6.VERSION + '-offline.html';
  document.title = P6.versionName();
  // always-visible version chip in the top bar (visible in every theme); click = About
  const chip = () => {
    const tb = document.getElementById('topbar'); if (!tb || document.getElementById('verChip')) return;
    const b = document.createElement('button'); b.id = 'verChip'; b.type = 'button'; b.className = 'verchip';
    b.textContent = 'v' + P6.VERSION + (P6.OFFLINE ? ' · Offline' : ''); b.title = P6.versionName() + ' · ' + P6.BUILD_DATE;
    b.onclick = () => { if (g.App && g.App.dialogs && g.App.dialogs.about) g.App.dialogs.about(); };
    const sp = tb.querySelector('.spacer'); if (sp) tb.insertBefore(b, sp); else tb.appendChild(b);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chip); else chip();
  setTimeout(chip, 500); setTimeout(chip, 2000);
})(window);
