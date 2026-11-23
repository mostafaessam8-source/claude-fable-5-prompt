"""Generates deck.json for build_ceo.js from ../../database/zulfi_data.json.
Also needed: sar_theme.js, sar_layouts.js, sar-logo*.png (copy from ../tga-deck), map.png (schematic site map) and train_art.png (cover artwork)."""
import json
d = json.load(open('../../database/zulfi_data.json', encoding='utf-8'))
ph = {}
for r in d['phases']['rows']:
    k = r['phase']
    if k == 'Both':
        for p in ('Phase 1', 'Phase 2'): ph.setdefault(p, {}).update(design_s_m=r['start_month'], design_f_m=r['finish_month'])
        continue
    key = {'Procurement': 'pc', 'Construction': 'cn', 'Testing and commissioning': 'tc'}[r['stage']]
    ph.setdefault(k, {}).update({key + '_s_m': r['start_month'], key + '_f_m': r['finish_month']})
items = {'Phase 1': [b for b in d['boq_items']['rows'] if b['phase'] == 'Phase 1' and b['ref'] not in ('1.1', '2.1')],
         'Phase 2': [b for b in d['boq_items']['rows'] if b['phase'] == 'Phase 2']}
for p in ph: ph[p]['items'] = [[b['ref'], b['package']] for b in items[p]]
cf = lambda t: [{'m0': r['month_from'], 'm1': r['month_to'], 'perf': r['progress_value_sar_m'], 'net': r['net_cash_sar_m']} for r in d[t]['rows']]
out = {'phases': ph, 'q': cf('cash_flow_quarterly'), 's': cf('cash_flow_semiannual'),
       'ms': {m['id']: {'m': m['month_from_ntp']} for m in d['milestones']['rows']}}
json.dump(out, open('deck.json', 'w'), indent=1); print('deck.json written')
