import openpyxl, re
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
wb = openpyxl.load_workbook('ZULFI-BOQ.xlsx')
b = wb['BOQ']; m = wb['Mapping']

# ---- Mapping: cost column to numbers, root total, contract phase of Phase 2 items
def num(v):
    if isinstance(v, (int, float)): return float(v)
    if v is None: return None
    s = re.sub(r'[^0-9.\-]', '', str(v)); return float(s) if s else 0.0
changed = []
for r in range(2, m.max_row + 1):
    v = m.cell(r, 29).value
    if v is not None:
        m.cell(r, 29).value = num(v); m.cell(r, 29).number_format = '#,##0.00'
    a = str(m.cell(r, 1).value or '')
    if re.match(r'^\s+[A-Z]{2,3}-\d+', a):
        ph, ref, cph = m.cell(r, 2).value, str(m.cell(r, 3).value), m.cell(r, 4).value
        if ph == 'Phase 2' and cph == 'Phase 1 (Billing)' and ref != '1.1':
            m.cell(r, 4).value = 'Phase 2 (Billing)'; changed.append((a.strip(), ref))
top = [r for r in range(2, m.max_row + 1) if re.match(r'^  \S', str(m.cell(r, 1).value or ''))]
m['AC2'] = '=' + '+'.join(f'AC{r}' for r in top); m['AC2'].number_format = '#,##0.00'
print('recoded activities', len(changed))

# ---- BOQ sheet
b['A37'] = '3.3'                                   # FF&E was typed 3.2.1; the baseline and the mapping use 3.3
b['J8'] = 'Mapped activity cost'; b['K8'] = 'Difference (BOQ - mapped)'; b['L8'] = '% of group'
item_rows = [10, 12, 14, 15, 17, 18, 19, 21, 22, 23, 24, 26, 27, 28, 36, 37, 38, 39]
for r in item_rows:
    b[f'J{r}'] = f'=SUMIF(Mapping!$C:$C,BOQ!A{r},Mapping!$AC:$AC)'
    b[f'J{r}'].number_format = '#,##0'; b[f'K{r}'].number_format = '#,##0'
b['K29'] = '=K26+K28+K39'                          # Railway Systems: 6.2 + 7.3 + 7.2 (was SUM(K25:K28): counted 6.3 twice and missed 7.2)
b['L39'] = '=K39/K29'
b['J30'] = '=SUM(J10:J28)'; b['J40'] = '=SUM(J36:J39)'; b['J44'] = '=J30+J40'
for c in ('J30', 'J40', 'J44'): b[c].number_format = '#,##0'
b['K44'] = '=H44-J44'; b['K44'].number_format = '#,##0'
b['K30'] = '=K10+K12+K14+K15+K17+K18+K19+K21+K22+K23+K24+K26+K27+K28'; b['K30'].number_format = '#,##0'; b['K40'].number_format = '#,##0'
b['K48'] = '=K50'; b['K50'] = '=K39+K38+K37+K36+K28+K27+K26+K24+K23+K22+K21+K19+K18+K17+K15+K14'
b['J51'] = None; b['K51'] = None

# ---- reconciliation sheet
ws = wb.create_sheet('Phase Reconciliation')
TEAL, DARK = '00778B', '3D3935'
H = Font(name='Calibri', bold=True, color='FFFFFF'); HF = PatternFill('solid', fgColor=TEAL)
thin = Side(style='thin', color='D1D5DB'); BD = Border(top=thin, bottom=thin, left=thin, right=thin)
def hdr(row, vals):
    for i, v in enumerate(vals, 1):
        c = ws.cell(row, i, v); c.font = H; c.fill = HF; c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True); c.border = BD
def put(row, vals, bold=False, fmt='#,##0'):
    for i, v in enumerate(vals, 1):
        c = ws.cell(row, i, v); c.border = BD; c.font = Font(name='Calibri', size=10, bold=bold); c.alignment = Alignment(wrap_text=True, vertical='top')
        if i > 1 and not (isinstance(v, str) and not v.startswith('=')): c.number_format = fmt
ws['A1'] = 'Phase values: reconciliation of the BOQ to the activity cost'; ws['A1'].font = Font(name='Calibri', size=14, bold=True, color=DARK)
ws['A2'] = 'All figures are formulas on the BOQ and Mapping sheets. SAR excl. VAT.'; ws['A2'].font = Font(name='Calibri', size=9, italic=True, color='6B7280')
hdr(4, ['A. Phase totals', 'BOQ (contract billing)', 'Mapped activity cost', 'Difference', 'Explanation'])
put(5, ['Phase 1', '=BOQ!H30', '=SUMIF(Mapping!$D:$D,"Phase 1 (Billing)",Mapping!$AC:$AC)', '=B5-C5', 'BOQ Phase 1 = items + 1.1 + 2.1. The mapped cost spreads the design lump sum (2.1) over all 16 items, so Phase 2 items carry part of it.'])
put(6, ['Phase 2', '=BOQ!H40', '=SUMIF(Mapping!$D:$D,"Phase 2 (Billing)",Mapping!$AC:$AC)', '=B6-C6', 'Mapped Phase 2 cost includes the design allocation of its 4 items.'])
put(7, ['Total', '=B5+B6', '=C5+C6', '=B7-C7', 'Must be zero (apart from cents of rounding).'], True)
hdr(9, ['B. Bridge', 'Phase 1', 'Phase 2', 'Total', 'Note'])
put(10, ['Mapped activity cost', '=C5', '=C6', '=B10+C10', 'From the Mapping sheet, grouped by Contract Phase.'])
put(11, ['Design allocation of Phase 2 items (BOQ 2.1)', '=B14', '=-B14', 0, 'Billed in Phase 1 under the contract (item 2.1), but carried by the Phase 2 items in the mapping.'])
put(12, ['Contract billing basis', '=B10+B11', '=C10+C11', '=B12+C12', ''], True)
put(13, ['BOQ', '=B5', '=B6', '=B13+C13', ''])
put(14, ['Design allocation of Phase 2 items', '=SUM(BOQ!J36:J39)-SUM(BOQ!H36:H39)', None, None, 'Mapped cost less BOQ value for items 3.3, 4.3, 6.1 and 7.2.'])
put(15, ['Check (billing basis less BOQ)', '=B12-B13', '=C12-C13', '=D12-D13', 'Zero means the phase values reconcile.'], True)
# the preliminaries activity PR-0195 sits in Phase 2 code but is billed in Phase 1 (item 1.1): it is already in Phase 1 (Billing)
hdr(17, ['C. Item', 'Phase', 'BOQ amount', 'Mapped cost', 'Design allocation'])
r = 18
for br in item_rows:
    put(r, [f'=BOQ!A{br}&"  "&BOQ!B{br}', 'Phase 1' if br < 33 else 'Phase 2', f'=BOQ!H{br}', f'=BOQ!J{br}', f'=D{r}-C{r}']); r += 1
put(r, ['Total', None, f'=SUM(C18:C{r-1})', f'=SUM(D18:D{r-1})', f'=SUM(E18:E{r-1})'], True)
r += 2
hdr(r, ['D. Findings', 'Where', 'Effect', '', 'Fix applied']); r += 1
finds = [
 ['Contract Phase coded Phase 1 for 24 design activities of Phase 2 items (3.3, 4.3, 6.1, 7.2)', 'Mapping column D', 'Phase 1 showed SAR 65,971,225 and Phase 2 SAR 34,027,775, SAR 962,225 away from the BOQ (65,009,000 and 34,990,000)', '', 'Recoded to Phase 2 (Billing). The bridge in section B now closes to zero.'],
 ['FF&E referenced as 3.2.1 in the BOQ and 3.3 in the mapping and baseline', 'BOQ A37', 'The BOQ total cost for FF&E read 0 on every mapping row; SAR 1,900,000 missing from the check', '', 'BOQ A37 set to 3.3.'],
 ['Check formulas pointing to a deleted range (#REF!)', 'BOQ J10:K39', 'Differences and group percentages did not calculate', '', 'J now sums the mapped cost by BOQ reference; K = BOQ less mapped.'],
 ['TOTAL PHASE #1 difference summed the group subtotals as well as the items', 'BOQ K30', 'Phase 1 difference showed twice the group amounts', '', 'K30 now adds the items only.'],
 ['Railway Systems subtotal counted item 6.3 twice and left out 7.2', 'BOQ K29', 'Group subtotal and percentages wrong', '', 'K29 = 6.2 + 7.3 + 7.2.'],
 ['Project total in the mapping typed as 99,999,999', 'Mapping AC2', 'SAR 999 above the contract value of SAR 99,999,000', '', 'AC2 is now the sum of the WBS totals.'],
 ['Activity costs stored as text (for example SAR514,660.83)', 'Mapping column AC', 'Could not be summed by SUMIF', '', 'Converted to numbers.'],
]
for f in finds: put(r, f); ws.row_dimensions[r].height = 48; r += 1
for col, w in zip('ABCDE', [64, 20, 22, 16, 70]): ws.column_dimensions[col].width = w
ws.sheet_view.showGridLines = False
wb.save('ZULFI-BOQ_Corrected.xlsx')
print('saved')
