/*
 * Dataset store. Imported Excel data is kept in the browser's IndexedDB so the
 * dashboard shows the latest import after a reload. Each source workbook
 * replaces only its own tables; the baseline (data/default-data.js) fills the rest.
 */
(function () {
  "use strict";
  var DB = "sar-cost-dashboard", STORE = "kv", KEY = "dataset";

  function open() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("IndexedDB unavailable"));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s);
        t.oncomplete = function () { res(out && out.result); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  window.SARStore = {
    load: function () {
      return tx("readonly", function (s) { return s.get(KEY); }).catch(function () {
        try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
      });
    },
    save: function (ds) {
      return tx("readwrite", function (s) { s.put(ds, KEY); }).catch(function () {
        try { localStorage.setItem(KEY, JSON.stringify(ds)); } catch (e) { /* storage unavailable */ }
      });
    },
    /* other values (e.g. the weekly PowerPoint template) under their own key */
    get: function (key) { return tx("readonly", function (s) { return s.get(key); }).catch(function () { return null; }); },
    set: function (key, value) { return tx("readwrite", function (s) { s.put(value, key); }); },
    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      return tx("readwrite", function (s) { s.delete(KEY); }).catch(function () {});
    }
  };
})();
