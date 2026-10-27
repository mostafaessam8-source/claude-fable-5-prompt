import json,pathlib
here=pathlib.Path(__file__).parent
data=(here/'data.json').read_text(encoding='utf8')
out=(here/'template.html').read_text(encoding='utf8').replace('/*DATA*/null',data)
(here/'index.html').write_text(out,encoding='utf8')
print('built',len(out))
