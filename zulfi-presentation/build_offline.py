#!/usr/bin/env python3
"""Bundle each deck page + css + js + data (+ images) into ONE self-contained HTML file for offline use.
  presentation.html -> downloads/Zulfi-Presentation-Offline.html          (interactive cost / schedule deck)
  management.html   -> downloads/Zulfi-Management-Update-Offline.html     (Arabic / English management update)"""
import re, base64, json, pathlib
root = pathlib.Path(__file__).parent


def build(page, out_name, assets=False):
    html = (root / page).read_text(encoding="utf-8")
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: "<style>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "\n</style>", html)
    if assets:  # images become data URIs, looked up at run time through window.ZASSETS
        data = {}
        for f in sorted((root / "assets").glob("*")):
            mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "svg": "image/svg+xml"}[f.suffix[1:].lower()]
            data[f.name] = "data:%s;base64,%s" % (mime, base64.b64encode(f.read_bytes()).decode())
        html = html.replace('<script src="data.js"></script>', "<script>window.ZASSETS=" + json.dumps(data) + ";</script>\n<script src=\"data.js\"></script>", 1)
    html = re.sub(r'<script src="([^"]+)"></script>', lambda m: "<script>\n" + (root / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script") + "\n</script>", html)
    html = html.replace('href="index.html" title="Back to the guide"', 'href="#" title="Zulfi Railway Station"').replace('href="index.html" title="Guide"', 'href="#" title="Zulfi Railway Station"')
    html = re.sub(r'\s*<a [^>]*data-online[^>]*>.*?</a>', '', html)
    out = root / "downloads" / out_name
    out.write_text(html, encoding="utf-8")
    print("wrote", out, round(out.stat().st_size / 1024), "KB")


build("presentation.html", "Zulfi-Presentation-Offline.html")
build("management.html", "Zulfi-Management-Update-Offline.html", assets=True)
