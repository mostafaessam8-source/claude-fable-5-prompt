"""Adds the ZULFI-BL02 baseline tables to zulfi.db (from ../baseline-bl02/bl02_model.json) and refreshes CSV / JSON exports.
Run after build_db.py:  python3 add_bl02_tables.py"""
import sqlite3, json, csv, os
here = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(os.path.join(here, '..', 'baseline-bl02', 'bl02_model.json')))
con = sqlite3.connect(os.path.join(here, 'zulfi.db')); cur = con.cursor()
new = set(M['new']); dp = set(M['driving'])
for t in ('bl02_activities', 'bl02_relationships', 'bl02_critical_path'): cur.execute(f'DROP TABLE IF EXISTS {t}')
cur.execute('''CREATE TABLE bl02_activities (activity_id TEXT PRIMARY KEY, name TEXT, type TEXT, duration_days INTEGER, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT,
  total_float_days INTEGER, responsible TEXT, tga_process TEXT, submit_review TEXT, duration_basis TEXT, is_new_in_bl02 INTEGER, on_critical_path INTEGER)''')
cur.executemany('INSERT INTO bl02_activities VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [(t['code'], t['name'], t['type'], t['dur'], t['es'], t['ef'], t['ls'], t['lf'], t['tf'], t['resp'], t['tga'], t['sr'], t['basis'], int(t['code'] in new), int(t['code'] in dp)) for t in M['tasks']])
cur.execute('CREATE TABLE bl02_relationships (predecessor TEXT, successor TEXT, type TEXT, lag_days INTEGER)')
rows = sorted({(p, t['code'], typ, lag) for t in M['tasks'] for (p, typ, lag) in t['preds']} | {('TG-0730', 'MS-0120', 'FF', 0)})
cur.executemany('INSERT INTO bl02_relationships VALUES (?,?,?,?)', rows)
cur.execute('CREATE TABLE bl02_critical_path (seq INTEGER, activity_id TEXT, name TEXT, duration_days INTEGER, early_start TEXT, early_finish TEXT, total_float_days INTEGER)')
T = {t['code']: t for t in M['tasks']}
cur.executemany('INSERT INTO bl02_critical_path VALUES (?,?,?,?,?,?,?)', [(i, c, T[c]['name'], T[c]['dur'], T[c]['es'], T[c]['ef'], T[c]['tf']) for i, c in enumerate(M['driving'], 1)])
cur.execute("DROP VIEW IF EXISTS v_bl02_near_critical_tga")
cur.execute("CREATE VIEW v_bl02_near_critical_tga AS SELECT activity_id, name, early_finish, total_float_days, responsible FROM bl02_activities WHERE is_new_in_bl02 = 1 AND type != 'TT_LOE' AND total_float_days <= 30 ORDER BY total_float_days")
cur.execute("UPDATE deliverables SET status = 'Recovered from C001.rar: source-files/C001/Zulfi_Baseline_Programme.xer' WHERE file = 'Zulfi_Baseline_Programme.xer'")
cur.execute("UPDATE deliverables SET status = 'Superseded by baseline-bl02/ (BL02 XER with TGA activities and logic)' WHERE file = 'Zulfi_Baseline_Programme.xer'")
cur.execute("INSERT INTO deliverables VALUES ('baseline-bl02/Zulfi_Baseline_Programme_BL02_TGA.xer', 'ZULFI-BL02: 597 activities, 1,086 relationships, TGA process, SAR work permit and authority approvals, critical path', 'In repository')")
cur.execute("UPDATE tga_process_activities_draft SET note = note || ' [Draft superseded by bl02_activities, TG-xxxx]' WHERE note NOT LIKE '%superseded%'")
con.commit()
os.makedirs(os.path.join(here, 'csv'), exist_ok=True)
allj = json.load(open(os.path.join(here, 'zulfi_data.json'), encoding='utf-8'))
for name in ('bl02_activities', 'bl02_relationships', 'bl02_critical_path', 'deliverables', 'tga_process_activities_draft'):
    cur.execute(f'SELECT * FROM {name}'); cols = [c[0] for c in cur.description]; rws = cur.fetchall()
    with open(os.path.join(here, 'csv', name + '.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f); w.writerow(cols); w.writerows(rws)
    allj[name] = {'comment': allj.get(name, {}).get('comment', 'ZULFI-BL02 baseline'), 'rows': [dict(zip(cols, r)) for r in rws]}
json.dump(allj, open(os.path.join(here, 'zulfi_data.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(here, 'schema.sql'), 'w', encoding='utf-8').write('\n'.join(r[0] + ';' for r in cur.execute('SELECT sql FROM sqlite_master WHERE sql IS NOT NULL').fetchall()))
print({n: cur.execute(f'SELECT COUNT(*) FROM {n}').fetchone()[0] for n in ('bl02_activities', 'bl02_relationships', 'bl02_critical_path')})
