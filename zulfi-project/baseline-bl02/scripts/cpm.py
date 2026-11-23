"""CPM engine for the Zulfi XER (3 calendars, FS/SS/FF with lag, start/finish constraints).
Time model: working days of 8 h (08:00 to 16:00). A task of n days starts at 08:00 of a work day and finishes at 16:00 of its n-th work day.
Dates are python date objects; float is counted in working days of the task's calendar."""
import re, datetime as dt
from collections import defaultdict, deque

EPOCH = dt.date(1899, 12, 30)

class Cal:
    def __init__(self, data):
        self.dow = {}
        for m in re.finditer(r'\(0\|\|(\d)\(\)\((.*?)\)\)(?=\(0\|\||\)\)\(0\|\|Exceptions)', data):
            pass
        dw = re.search(r'DaysOfWeek\(\)\((.*?)\)\(0\|\|Exceptions', data, re.S).group(1)
        for d in range(1, 8):
            m = re.search(r'\(0\|\|%d\(\)\((.*?)\)\)(?=\(0\|\|\d\(\)|$)' % d, dw)
            self.dow[d] = bool(m and 's|' in m.group(1))
        self.exc = set(EPOCH + dt.timedelta(days=int(x)) for x in re.findall(r'\(d\|(\d+)\)', data))
        self._cache = {}
    def works(self, d):
        wd = (d.weekday() + 1) % 7 + 1          # Monday=2 ... Sunday=1 (P6: 1 = Sunday)
        return self.dow[wd] and d not in self.exc
    def nxt(self, d):                            # first work day >= d
        while not self.works(d): d += dt.timedelta(days=1)
        return d
    def prv(self, d):                            # last work day <= d
        while not self.works(d): d -= dt.timedelta(days=1)
        return d
    def add(self, d, n):                         # d is a work day; move n work days (n may be negative)
        step = 1 if n >= 0 else -1
        k = abs(n)
        while k:
            d += dt.timedelta(days=step)
            if self.works(d): k -= 1
        return d
    def count(self, a, b):                       # work days from a to b (signed), both inclusive-exclusive semantics: number of steps
        if a == b: return 0
        s = 1 if b > a else -1; n = 0; d = a
        while d != b:
            d += dt.timedelta(days=s)
            if self.works(d): n += s
        return n

class Task:
    __slots__ = ('id', 'code', 'name', 'dur', 'cal', 'ttype', 'cstr', 'cstr_date', 'es', 'ef', 'ls', 'lf', 'tf', 'ff', 'preds', 'succs', 'wbs', 'row')

def load(T, must_finish=None):
    cals = {c['clndr_id']: Cal(c['clndr_data']) for c in T['CALENDAR']['r']}
    tasks = {}
    for r in T['TASK']['r']:
        t = Task(); t.id = r['task_id']; t.code = r['task_code']; t.name = r['task_name']
        t.dur = int(round(float(r['target_drtn_hr_cnt'] or 0) / 8)); t.cal = cals[r['clndr_id']]; t.ttype = r['task_type']
        if t.ttype in ('TT_Mile', 'TT_FinMile'): t.dur = 0
        t.cstr = r['cstr_type']; t.cstr_date = dt.datetime.strptime(r['cstr_date'], '%Y-%m-%d %H:%M').date() if r['cstr_date'] else None
        t.preds = []; t.succs = []; t.wbs = r['wbs_id']; t.row = r
        tasks[t.id] = t
    for r in T['TASKPRED']['r']:
        p, s = tasks[r['pred_task_id']], tasks[r['task_id']]
        rel = (p, s, r['pred_type'][3:], int(round(float(r['lag_hr_cnt'] or 0) / 8)))
        s.preds.append(rel); p.succs.append(rel)
    return cals, tasks

def topo(tasks):
    indeg = {t.id: len(t.preds) for t in tasks.values()}
    q = deque([t for t in tasks.values() if indeg[t.id] == 0]); order = []
    while q:
        t = q.popleft(); order.append(t)
        for (_, s, _, _) in t.succs:
            indeg[s.id] -= 1
            if indeg[s.id] == 0: q.append(s)
    if len(order) != len(tasks):
        bad = [t.code for t in tasks.values() if indeg[t.id] > 0][:10]
        raise ValueError('logic loop involving ' + ','.join(bad))
    return order

def is_ms(t): return t.ttype in ('TT_Mile', 'TT_FinMile')

def fin_of(t, start):  # finish day from start day
    return start if t.dur == 0 else t.cal.add(start, t.dur - 1)

def finms(t): return t.ttype == 'TT_FinMile' and t.dur == 0

def forward(tasks, order, start_date, lagcal='pred'):
    for t in order:
        c = t.cal; s_min = c.nxt(start_date); f_min = None
        for (p, _, typ, lag) in t.preds:
            lc = p.cal if lagcal == 'pred' else c
            if typ == 'FS':
                d = p.ef
                if lag: d = lc.add(lc.prv(d), lag)
                if finms(t): f_min = d if f_min is None else max(f_min, d)
                else: s_min = max(s_min, c.nxt(d + dt.timedelta(days=1)))
            elif typ == 'SS':
                d = p.es
                if lag: d = lc.add(lc.prv(d), lag)
                s_min = max(s_min, c.nxt(d))
            elif typ == 'FF':
                d = p.ef
                if lag: d = lc.add(lc.prv(d), lag)
                f_min = d if f_min is None else max(f_min, d)
        if f_min is not None:
            f_min = c.nxt(f_min)
            st = f_min if t.dur == 0 else c.add(f_min, -(t.dur - 1))
            s_min = max(s_min, st)
        if t.cstr == 'CS_MSO' and t.cstr_date: s_min = c.nxt(t.cstr_date)
        if t.cstr == 'CS_MSOA' and t.cstr_date: s_min = max(s_min, c.nxt(t.cstr_date))
        t.es = s_min; t.ef = fin_of(t, s_min)
        if t.cstr == 'CS_MEO' and t.cstr_date:
            t.ef = c.prv(t.cstr_date); t.es = t.ef if t.dur == 0 else c.add(t.ef, -(t.dur - 1))

def backward(tasks, order, must_finish, lagcal='pred'):
    for t in reversed(order):
        c = t.cal; lf = None; ls_cap = None
        for (_, s, typ, lag) in t.succs:
            lc = t.cal if lagcal == 'pred' else s.cal
            if typ == 'FS':
                if finms(s): d = s.lf
                else: d = s.ls - dt.timedelta(days=1)
                if lag: d = lc.add(lc.prv(d), -lag)
                cand = c.prv(d); lf = cand if lf is None else min(lf, cand)
            elif typ == 'SS':
                d = s.ls
                if lag: d = lc.add(lc.prv(d), -lag)
                cand = c.prv(d); ls_cap = cand if ls_cap is None else min(ls_cap, cand)
            elif typ == 'FF':
                d = s.lf
                if lag: d = lc.add(lc.prv(d), -lag)
                cand = c.prv(d); lf = cand if lf is None else min(lf, cand)
        if lf is None: lf = c.prv(must_finish)
        if ls_cap is not None:
            lf = min(lf, ls_cap if t.dur == 0 else c.add(ls_cap, t.dur - 1))
        if t.cstr == 'CS_MEO' and t.cstr_date: lf = min(lf, c.prv(t.cstr_date))
        t.lf = lf; t.ls = lf if t.dur == 0 else c.add(lf, -(t.dur - 1))
        t.tf = c.count(t.ef, t.lf); t.ff = None

def schedule(tasks, start_date, must_finish, lagcal='pred'):
    order = topo(tasks)
    forward(tasks, order, start_date, lagcal); backward(tasks, order, must_finish, lagcal)
    return order

def driving_path(tasks, end_code):
    """Longest path: from the end task trace back the driving predecessors (relationship float = 0)."""
    end = [t for t in tasks.values() if t.code == end_code][0]
    path = [end]; cur = end
    while cur.preds:
        best = None
        for (p, _, typ, lag) in cur.preds:
            if typ == 'FS':
                gap = cur.es - p.ef
            elif typ == 'SS':
                gap = cur.es - p.es
            else:
                gap = cur.ef - p.ef
            key = (abs((gap).days) , -p.tf if p.tf is not None else 0)
            if best is None or key < best[0] or (key == best[0] and (p.dur, p.es) > (best[1].dur, best[1].es)):
                best = (key, p)
        cur = best[1]; path.append(cur)
    return list(reversed(path))
