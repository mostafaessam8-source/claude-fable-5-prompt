#!/usr/bin/env python3
"""Bundle presentation.html + css + js + data into ONE self-contained HTML file for offline use."""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / "presentation.html").read_text(encoding="utf-8")
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: "<style>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "\n</style>", html)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: "<script>\n" + (root / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script") + "\n</script>", html)
html = html.replace('href="index.html" title="Back to the guide"', 'href="#" title="Zulfi Railway Station"')
html = re.sub(r'\s*<a [^>]*data-online[^>]*>.*?</a>', '', html)
out = root / "downloads" / "Zulfi-Presentation-Offline.html"
out.write_text(html, encoding="utf-8")
print("wrote", out, round(out.stat().st_size / 1024), "KB")
