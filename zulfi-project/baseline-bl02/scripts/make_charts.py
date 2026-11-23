import json, datetime as dt, textwrap
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt, matplotlib.dates as mdates
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Patch
from matplotlib import font_manager as fm
for f in fm.findSystemFonts():
    if 'Inter' in f and 'Display' not in f: fm.fontManager.addfont(f)
plt.rcParams['font.family'] = ['Inter', 'DejaVu Sans']

M = json.load(open('/home/user/c001/out/bl02_model.json'))
T = {t['code']: t for t in M['tasks']}
TEAL, DARK, SLATE, SKY, MID, GRAY, RED, YEL = '#00778B', '#3D3935', '#768692', '#59CBE8', '#71B2C9', '#C8C9C7', '#CB2C30', '#F1B434'
D = dt.date.fromisoformat
loe = M['loe']

def stage_color(code):
    if code.startswith('DS-') or code in ('DS-0020',): return TEAL
    if code.startswith('PC-'): return MID
    if code.startswith('CN-'): return SLATE
    if code.startswith('TC-'): return YEL
    if code.startswith(('CO-', 'PR-0210')): return DARK
    return GRAY

# ---------------------------------------------------------------- Chart 1: clean critical path
path = [T[c] for c in M['driving']]
fig, ax = plt.subplots(figsize=(16.5, 10.2), dpi=130)
n = len(path)
for i, t in enumerate(path):
    y = n - 1 - i; s, f = D(t['es']), D(t['ef'])
    ms = t['type'] in ('TT_Mile', 'TT_FinMile') or t['dur'] == 0
    if ms:
        ax.plot([f], [y], marker='D', color=RED, ms=9, zorder=5)
    else:
        ax.barh(y, (f - s).days + 1, left=mdates.date2num(s), height=0.62, color=stage_color(t['code']), edgecolor='white', zorder=3)
    lab = textwrap.shorten(t['name'], 74, placeholder='...')
    ax.text(mdates.date2num(D('2026-10-24')), y, f"{t['code']}  {lab}", ha='right', va='center', fontsize=7.6, color=DARK)
    dur = '' if ms else f"{t['dur']} d"
    ax.text(mdates.date2num(f) + 6, y, f"{dur}  {f.strftime('%d-%b-%y')}", va='center', fontsize=7, color=SLATE)
for g, lab in (('DS-0020', 'Gate 1'), ('DS-0360', 'Gate 2'), ('DS-0700', 'Gate 3'), ('CO-0020', 'Taking-Over')):
    x = D(T[g]['ef']); ax.axvline(mdates.date2num(x), color=SLATE, lw=0.8, ls='--', zorder=1)
    ax.text(mdates.date2num(x), n + 0.1, f"{lab}\n{x.strftime('%d-%b-%y')}", ha='center', va='bottom', fontsize=7.5, color=DARK, fontweight='bold')
ax.set_xlim(mdates.date2num(D('2026-10-24')) - 1, mdates.date2num(D('2029-03-20')))
ax.set_ylim(-1, n + 1.6); ax.set_yticks([])
ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2)); ax.xaxis.set_major_formatter(mdates.DateFormatter('%b-%y'))
ax.tick_params(axis='x', labelsize=8); ax.grid(axis='x', color='#E6F1F4', lw=0.7, zorder=0)
for sp in ('top', 'right', 'left'): ax.spines[sp].set_visible(False)
ax.set_position([0.40, 0.07, 0.58, 0.83])
fig.text(0.02, 0.965, 'Critical path: Notice to Proceed to Contract Completion', fontsize=15, fontweight='bold', color=TEAL)
fig.text(0.02, 0.94, 'ZULFI-BL02 | longest path, 35 activities, zero total float | NTP assumed 1 Nov 2026 (not confirmed)', fontsize=9, color=SLATE)
ax.legend(handles=[Patch(color=TEAL, label='Design'), Patch(color=MID, label='Procurement'), Patch(color=SLATE, label='Construction'), Patch(color=YEL, label='Testing and commissioning'), Patch(color=DARK, label='Close-out'), plt.Line2D([], [], marker='D', color=RED, ls='', label='Milestone')],
          loc='upper right', bbox_to_anchor=(1.0, 0.80), fontsize=8, frameon=False, ncol=1)
fig.savefig('/home/user/c001/out/Zulfi_BL02_Critical_Path.png'); c1 = fig

# ---------------------------------------------------------------- Chart 2: TGA and permit chain
groups = [('09.01 ICP and Safety Planning', '0901'), ('09.02 Design Safety Assurance', '0902'), ('09.03 Authority Design Approvals', '0903'), ('09.04 SAR Work Permit and Possession', '0904'), ('09.05 Construction Safety Assurance', '0905'), ('09.06 Verification and Readiness', '0906')]
wbs_ids = M['wbs']; inv = {v: k for k, v in wbs_ids.items()}
rows = []
for gname, key in groups:
    rows.append(('H', gname))
    for c in M['new']:
        if inv.get(T[c]['wbs']) == key: rows.append(('A', T[c]))
ownc = {'Contractor': TEAL, 'SAR': DARK, 'ICP': YEL, 'Authority': RED}
fig2, ax = plt.subplots(figsize=(16.5, 13.2), dpi=130)
N = len(rows)
for i, (k, v) in enumerate(rows):
    y = N - 1 - i
    if k == 'H':
        ax.axhspan(y - 0.45, y + 0.45, color='#E6F1F4', zorder=0); ax.text(mdates.date2num(D('2026-10-24')), y, v, ha='right', va='center', fontsize=8.6, fontweight='bold', color=TEAL); continue
    t = v; s, f = D(t['es']), D(t['ef'])
    if t['type'] == 'TT_LOE': s, f = D(loe['es']), D(loe['ef'])
    ax.barh(y, (f - s).days + 1, left=mdates.date2num(s), height=0.6, color=ownc[t['resp']], edgecolor='white', zorder=3, hatch='///' if t['type'] == 'TT_LOE' else None, alpha=0.55 if t['type'] == 'TT_LOE' else 1)
    ax.text(mdates.date2num(D('2026-10-24')), y, f"{t['code']}  {textwrap.shorten(t['name'], 70, placeholder='...')}", ha='right', va='center', fontsize=6.9, color=DARK)
    fl = '' if t['type'] == 'TT_LOE' else f"  float {t['tf']} d"
    ax.text(mdates.date2num(f) + 5, y, f"{t['dur']} d{fl}" if t['type'] != 'TT_LOE' else 'LOE', va='center', fontsize=6.4, color=RED if (t['tf'] <= 30 and t['type'] != 'TT_LOE') else SLATE)
for g, lab in (('DS-0020', 'Gate 1'), ('DS-0360', 'Gate 2'), ('DS-0700', 'Gate 3'), ('PR-0120', 'Work permit'), ('CO-0020', 'Taking-Over')):
    x = D(T[g]['ef']); ax.axvline(mdates.date2num(x), color=SLATE, lw=0.8, ls='--', zorder=1)
    ax.text(mdates.date2num(x), N + (0.1 if lab != 'Work permit' else 1.1), lab, ha='center', va='bottom', fontsize=7.4, color=DARK, fontweight='bold', rotation=0)
ax.set_xlim(mdates.date2num(D('2026-10-24')) - 1, mdates.date2num(D('2029-02-10'))); ax.set_ylim(-1, N + 2.4); ax.set_yticks([])
ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2)); ax.xaxis.set_major_formatter(mdates.DateFormatter('%b-%y')); ax.tick_params(axis='x', labelsize=8)
ax.grid(axis='x', color='#E6F1F4', lw=0.7, zorder=0)
for sp in ('top', 'right', 'left'): ax.spines[sp].set_visible(False)
ax.set_position([0.41, 0.05, 0.57, 0.88])
fig2.text(0.02, 0.972, 'TGA process, SAR work permit and authority approvals', fontsize=15, fontweight='bold', color=TEAL)
fig2.text(0.02, 0.953, 'ZULFI-BL02 | 52 new activities | submission and review kept separate | red float = 30 days or less', fontsize=9, color=SLATE)
ax.legend(handles=[Patch(color=TEAL, label='Contractor'), Patch(color=DARK, label='SAR'), Patch(color=YEL, label='Independent Competent Person'), Patch(color=RED, label='Authority (TGA, HCIS)')], loc='upper right', bbox_to_anchor=(1.0, 0.99), fontsize=8, frameon=False, ncol=1)
fig2.savefig('/home/user/c001/out/Zulfi_BL02_TGA_Process_Gantt.png')

with PdfPages('/home/user/c001/out/Zulfi_BL02_Critical_Path_and_TGA_Gantt.pdf') as pdf:
    pdf.savefig(c1); pdf.savefig(fig2)
print('charts done')
