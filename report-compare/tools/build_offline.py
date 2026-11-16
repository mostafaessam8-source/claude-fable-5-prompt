#!/usr/bin/env python3
"""Build ONE self-contained HTML file (css + all scripts inlined) that works offline by double-click.
Usage: python3 tools/build_offline.py OUT.html [build-label]"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]); label = sys.argv[2] if len(sys.argv) > 2 else 'offline'
h = (root / 'index.html').read_text(encoding='utf-8')
h = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">',
           lambda m: '<style>\n' + (root / m.group(1)).read_text(encoding='utf-8') + '\n</style>', h)
def js(m):
    code = (root / m.group(1)).read_text(encoding='utf-8')
    return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>'
h = re.sub(r'<script src="((?:js|vendor)/[^"]+)"></script>', js, h)
h = re.sub(r' ?<a class="offl".*?</a>', '', h)
h = h.replace('__BUILD__', label + ' · offline file')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(h, encoding='utf-8')
print(out, round(out.stat().st_size / 1024), 'KB')
