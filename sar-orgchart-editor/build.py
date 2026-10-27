import json,pathlib
here=pathlib.Path(__file__).parent
data=(here/'data.json').read_text(encoding='utf8')
tpl=(here/'template.html').read_text(encoding='utf8').replace('/*DATA*/null',data)
raw=tpl.replace('</'+'script','<\\/'+'script')
out=tpl.replace('<!--SAVED-->','',1).replace('<!--SELFSRC-->','<script type="text/plain" id="selfsrc">'+raw+'</'+'script>',1)
(here/'index.html').write_text(out,encoding='utf8')
print('built',len(out))
