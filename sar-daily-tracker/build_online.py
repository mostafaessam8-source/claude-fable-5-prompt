#!/usr/bin/env python3
"""Build the online copy of the SAR Daily Tracker.

The published page carries no data: it starts empty and each user's items stay in their own
browser (or in their own private repository through Cloud sync).

    python3 sar-daily-tracker/build_online.py <output-dir>
"""
import pathlib
import re
import sys

src = pathlib.Path(__file__).with_name("SAR_Daily_Tracker.html").read_text(encoding="utf-8")
out, n = re.subn(
    r'(<script id="seed" type="application/json">).*?(</script>)',
    lambda m: m.group(1) + '{"savedAt":0,"items":[]}' + m.group(2),
    src, count=1, flags=re.S,
)
if n != 1:
    sys.exit("seed block not found")
dest = pathlib.Path(sys.argv[1])
dest.mkdir(parents=True, exist_ok=True)
(dest / "index.html").write_text(out, encoding="utf-8")
print(f"wrote {dest / 'index.html'} ({len(out):,} bytes, no data)")
