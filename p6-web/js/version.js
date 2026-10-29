/* P6 Web – version stamp. Bump VERSION for each release; tools/build-offline.js stamps COMMIT / OFFLINE into the single-file offline copy. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  P6.VERSION = '2.2.1'; P6.BUILD_DATE = '2026-10-29'; P6.COMMIT = 'dev'; P6.OFFLINE = false;
  P6.versionName = () => 'P6 Web – Schedule Studio v' + P6.VERSION + (P6.COMMIT && P6.COMMIT !== 'dev' ? ' (' + P6.COMMIT + ')' : '') + (P6.OFFLINE ? ' · Offline' : '');
  P6.offlineFile = () => 'P6-Web-v' + P6.VERSION + '-offline.html';
  document.title = P6.versionName();
})(window);
