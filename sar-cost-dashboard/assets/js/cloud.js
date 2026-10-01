/*
 * Cloud copy of the import files in the user's own PRIVATE GitHub repository (e.g. <owner>/nsr-dashboard-data).
 * The dashboard repository is public, so project files are never stored there. Each device connects once with a
 * fine-grained personal access token (Contents: read & write on that one repository); the token stays in this
 * browser. Layout in the data repository:
 *   imports/<source>/<file name>   the original workbook of each import (re-imports overwrite the same name)
 *   template/<file name>           the weekly PowerPoint template
 *   index.json                     latest file per source + template, with dates
 */
(function () {
  "use strict";
  var KEY = "sarCloud", API = "https://api.github.com";

  function cfg() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function setCfg(c) { try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } }
  function enc(path) { return path.split("/").map(encodeURIComponent).join("/"); }

  function api(path, opt) {
    var c = cfg(); if (!c) return Promise.reject(new Error("Cloud storage is not connected."));
    opt = opt || {};
    var h = { Authorization: "Bearer " + c.token, "X-GitHub-Api-Version": "2022-11-28", Accept: opt.raw ? "application/vnd.github.raw" : "application/vnd.github+json" };
    if (opt.body) h["Content-Type"] = "application/json";
    return fetch(API + path, { method: opt.method || "GET", headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined, cache: "no-store" }).then(function (r) {
      if (opt.allow404 && r.status === 404) return null;
      if (!r.ok) return r.text().then(function (t) { var m = ""; try { m = JSON.parse(t).message; } catch (e) { m = t; }
        throw new Error("GitHub " + r.status + (m ? ": " + m : "")); });
      return opt.raw ? r.arrayBuffer() : r.json();
    });
  }
  function repoPath(p) { return "/repos/" + cfg().repo + "/contents/" + enc(p); }
  function b64(buf) {
    var u = new Uint8Array(buf), s = "", CH = 0x8000;
    for (var i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  }
  function put(path, buf, message) {
    return api(repoPath(path), { allow404: true }).then(function (cur) {
      return api(repoPath(path), { method: "PUT", body: { message: message, content: b64(buf), sha: cur && cur.sha ? cur.sha : undefined } });
    });
  }
  function get(path) { return api(repoPath(path), { raw: true }); }
  function readIndex() {
    return api(repoPath("index.json"), { raw: true, allow404: true }).then(function (b) {
      if (!b) return { sources: {}, template: null };
      try { var o = JSON.parse(new TextDecoder().decode(b)); o.sources = o.sources || {}; return o; } catch (e) { return { sources: {}, template: null }; }
    });
  }
  var queue = Promise.resolve();          // serialise writes (index.json is read-modify-write)
  function writeIndex(mut) {
    queue = queue.then(function () {
      return readIndex().then(function (ix) { mut(ix); ix.updatedAt = new Date().toISOString();
        return put("index.json", new TextEncoder().encode(JSON.stringify(ix, null, 2)).buffer, "Update index"); });
    });
    return queue;
  }
  function safeName(n) { return String(n || "file").replace(/[\\/:*?"<>|#%]+/g, "_"); }

  window.SARCloud = {
    config: cfg,
    connected: function () { var c = cfg(); return !!(c && c.repo && c.token); },
    /** Check the token and repository; refuses a public repository. */
    connect: function (repo, token) {
      repo = String(repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return Promise.reject(new Error("Repository must look like owner/name."));
      setCfg({ repo: repo, token: String(token || "").trim() });
      return api("/repos/" + repo).then(function (r) {
        if (!r.private) { setCfg(null); throw new Error("This repository is public. Use a PRIVATE repository for project files."); }
        if (r.permissions && !r.permissions.push) { setCfg(null); throw new Error("The token cannot write to this repository (needs Contents: read and write)."); }
        return r;
      }).catch(function (e) { setCfg(null); throw e; });
    },
    disconnect: function () { setCfg(null); },
    index: readIndex,
    uploadSource: function (source, name, buf) {
      var path = "imports/" + source + "/" + safeName(name);
      queue = queue.then(function () { return put(path, buf, "Import " + name); });
      return queue.then(function () {
        return writeIndex(function (ix) { ix.sources[source] = { path: path, fileName: name, importedAt: new Date().toISOString(), size: buf.byteLength }; });
      });
    },
    uploadTemplate: function (name, buf) {
      var path = "template/" + safeName(name);
      queue = queue.then(function () { return put(path, buf, "Weekly PPT template " + name); });
      return queue.then(function () { return writeIndex(function (ix) { ix.template = { path: path, fileName: name, savedAt: new Date().toISOString(), size: buf.byteLength }; }); });
    },
    download: get
  };
})();
