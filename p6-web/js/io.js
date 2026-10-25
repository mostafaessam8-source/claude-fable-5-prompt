/* P6 Web – import / export: Primavera XER, PMXML (read), CSV, JSON. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  const { toDay, fromDay } = P6;

  // ================= XER parsing =================
  function parseXER(text) {
    const out = { header: null, tables: {}, order: [] };
    let cur = null;
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      const c = line.split('\t');
      if (c[0] === 'ERMHDR') out.header = c.slice(1);
      else if (c[0] === '%T') { cur = { name: c[1], fields: [], rows: [] }; out.tables[c[1]] = cur; out.order.push(c[1]); }
      else if (c[0] === '%F') { if (cur) cur.fields = c.slice(1); }
      else if (c[0] === '%R') {
        if (cur) { const o = {}; for (let i = 0; i < cur.fields.length; i++) o[cur.fields[i]] = c[i + 1] === undefined ? '' : c[i + 1]; cur.rows.push(o); }
      } else if (c[0] === '%E') cur = null;
    }
    if (!out.header && !out.tables.TASK) throw new Error('Not an XER file');
    return out;
  }
  function decodeBuffer(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }

  // P6 calendar blob: (0||CalendarData()( (0||DaysOfWeek()( (0||1()()) ... ))(0||Exceptions()(...))))
  function parseCalData(str) {
    const s = String(str || '').replace(/[\s\x00-\x1f\x7f]+/g, '');
    let i = 0;
    function node() {
      i++;
      const h = i;
      while (i < s.length && s[i] !== '(') i++;
      const name = s.slice(h, i).split('||').pop();
      i++;
      const a = i;
      while (i < s.length && s[i] !== ')') i++;
      const attrs = s.slice(a, i);
      i++;
      const kids = [];
      if (s[i] === '(') {
        i++;
        while (s[i] === '(') kids.push(node());
        i++;
      }
      i++;
      return { name, attrs, kids };
    }
    if (s[0] !== '(') return null;
    try { return node(); } catch (e) { return null; }
  }
  const find = (n, name) => (n ? n.kids.find((k) => k.name === name) : null);

  function calFromRow(r) {
    const cal = P6.newCal(+r.clndr_id || r.clndr_id, r.clndr_name || 'Calendar');
    cal.hrs = parseFloat(r.day_hr_cnt) || 8;
    cal.work = [true, true, true, true, true, false, false];
    const tree = parseCalData(r.clndr_data);
    if (tree) {
      const dw = find(tree, 'DaysOfWeek');
      if (dw) { cal.work = [0, 1, 2, 3, 4, 5, 6].map((d) => { const k = dw.kids.find((x) => x.name === String(d + 1)); return !!(k && k.kids.length); }); }
      const ex = find(tree, 'Exceptions');
      if (ex) for (const e of ex.kids) {
        const m = /d\|(\d+)/.exec(e.attrs);
        if (m) cal.exc[+m[1] - 25569] = e.kids.length > 0;
      }
    }
    cal.rawRow = r;
    return cal;
  }
  function calToData(cal) {
    const shift = (h) => `(0||0(s|08:00|f|${String(8 + Math.round(h)).padStart(2, '0')}:00)())`;
    const days = cal.work.map((w, i) => `(0||${i + 1}()(${w ? shift(cal.hrs) : ''}))`.replace('()()', '()()')).join('');
    const exc = Object.keys(cal.exc).map((d) => `(0||${0}(d|${+d + 25569})(${cal.exc[d] ? shift(cal.hrs) : ''}))`).join('');
    return `(0||CalendarData()((0||DaysOfWeek()(${days}))(0||VIEW(ShowTotal|Y)())(0||Exceptions()(${exc}))))`;
  }

  const CSTR = { CS_MSOA: 'SNET', CS_MSOB: 'SNLT', CS_MEOA: 'FNET', CS_MEOB: 'FNLT', CS_MANDSTART: 'MSO', CS_MSO: 'MSO', CS_MANDFIN: 'MFO', CS_MEO: 'MFO', CS_ALAP: 'ALAP' };
  const CSTR_REV = { SNET: 'CS_MSOA', SNLT: 'CS_MSOB', FNET: 'CS_MEOA', FNLT: 'CS_MEOB', MSO: 'CS_MANDSTART', MFO: 'CS_MANDFIN', ALAP: 'CS_ALAP' };
  const STAT = { TK_NotStart: 'NS', TK_Active: 'IP', TK_Complete: 'C' };
  const STAT_REV = { NS: 'TK_NotStart', IP: 'TK_Active', C: 'TK_Complete' };
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const r2 = (n) => Math.round(n * 100) / 100;

  function xerProjects(x) {
    return (x.tables.PROJECT ? x.tables.PROJECT.rows : []).map((r) => {
      const n = x.tables.TASK ? x.tables.TASK.rows.filter((t) => t.proj_id === r.proj_id).length : 0;
      return { id: r.proj_id, name: r.proj_short_name || r.proj_id, tasks: n, base: r.orig_proj_id && r.orig_proj_id !== r.proj_id };
    });
  }

  function fromXER(x, projId) {
    const T = (n) => (x.tables[n] ? x.tables[n].rows : []);
    const prow = T('PROJECT').find((r) => r.proj_id === projId) || T('PROJECT')[0];
    if (!prow) throw new Error('No PROJECT table');
    projId = prow.proj_id;
    const p = P6.newProject(prow.proj_short_name || 'Project');
    p.id = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    p.cals = []; p.wbs = []; p.tasks = []; p.rels = []; p.rsrc = []; p.asg = [];
    p.planStart = toDay(prow.plan_start_date) ?? toDay(prow.scd_end_date) ?? P6.todayDay();
    p.dataDate = toDay(prow.last_recalc_date) ?? p.planStart;
    if (p.dataDate < p.planStart) p.planStart = p.dataDate;
    p.mustFinish = toDay(prow.plan_end_date);
    p.xer = { x, projId };

    // WBS
    const wr = T('PROJWBS').filter((r) => r.proj_id === projId);
    const wids = new Set(wr.map((r) => r.wbs_id));
    for (const r of wr) {
      p.wbs.push({
        id: +r.wbs_id, parent: wids.has(r.parent_wbs_id) ? +r.parent_wbs_id : null,
        code: r.wbs_short_name || '', name: r.wbs_name || r.wbs_short_name || '', seq: num(r.seq_num),
        root: r.proj_node_flag === 'Y'
      });
    }
    if (!p.wbs.length) p.wbs.push({ id: 1, parent: null, code: 'P1', name: p.name, seq: 0 });
    const root = p.wbs.find((w) => w.root) || p.wbs.find((w) => w.parent == null);
    if (root) p.desc = root.name;

    // tasks (calendars referenced)
    const calRows = new Map(T('CALENDAR').map((r) => [r.clndr_id, r]));
    const usedCal = new Set([prow.clndr_id]);
    const tr = T('TASK').filter((r) => r.proj_id === projId);
    for (const r of tr) usedCal.add(r.clndr_id);
    for (const id of usedCal) if (calRows.has(id)) p.cals.push(calFromRow(calRows.get(id)));
    if (!p.cals.length) p.cals.push(P6.newCal(1, 'Standard Calendar'));
    p.defCal = p.cals.find((c) => String(c.id) === String(prow.clndr_id)) ? p.cals.find((c) => String(c.id) === String(prow.clndr_id)).id : p.cals[0].id;
    const calBy = new Map(p.cals.map((c) => [String(c.id), c]));

    let maxId = 100;
    const taskIds = new Set();
    tr.forEach((r, i) => {
      const cal = calBy.get(r.clndr_id) || calBy.get(String(p.defCal));
      const hrs = cal.hrs || 8;
      const status = STAT[r.status_code] || 'NS';
      const t = P6.newTask(p, +r.wbs_id, {
        id: +r.task_id, code: r.task_code, name: r.task_name, type: r.task_type || 'TT_Task', cal: cal.id,
        status, pctType: r.complete_pct_type === 'CP_Phys' ? 'phys' : r.complete_pct_type === 'CP_Units' ? 'units' : 'dur', seq: i
      });
      p.nid = Math.max(p.nid, +r.task_id);
      t.dur = r2(num(r.target_drtn_hr_cnt) / hrs);
      t.rem = status === 'C' ? 0 : r2(num(r.remain_drtn_hr_cnt) / hrs);
      t.as = toDay(r.act_start_date);
      t.af = toDay(r.act_end_date);
      if (status === 'NS') { t.as = null; t.af = null; }
      if (status === 'IP') t.af = null;
      t.es = status === 'NS' ? (toDay(r.early_start_date) ?? toDay(r.target_start_date)) : t.as;
      t.ef = status === 'C' ? t.af : (toDay(r.reend_date) ?? toDay(r.early_end_date) ?? toDay(r.target_end_date));
      t.rs = status === 'C' ? null : (toDay(r.restart_date) ?? t.es);
      t.ls = toDay(r.late_start_date); t.lf = toDay(r.late_end_date);
      t.tf = status === 'C' ? null : r2(num(r.total_float_hr_cnt) / hrs);
      t.ff = status === 'C' ? null : r2(num(r.free_float_hr_cnt) / hrs);
      t.crit = status !== 'C' && t.tf != null && t.tf <= 0;
      t.bs = toDay(r.target_start_date); t.bf = toDay(r.target_end_date); t.bdur = t.dur;
      t.ct = CSTR[r.cstr_type] || ''; t.cd = t.ct ? toDay(r.cstr_date) : null;
      t.pct = status === 'C' ? 100 : t.pctType === 'phys' ? num(r.phys_complete_pct) : status === 'NS' || !(t.dur > 0) ? 0 : Math.round(((t.dur - t.rem) / t.dur) * 100);
      t.dtype = r.duration_type || 'DT_FixedDUR2'; t.rev = r.rev_fdbk_flag === 'Y'; t.phys = num(r.phys_complete_pct);
      t.raw = undefined; delete t.raw;
      p.tasks.push(t);
      taskIds.add(String(r.task_id));
    });
    // relationships
    for (const r of T('TASKPRED')) {
      if (!taskIds.has(r.task_id) || !taskIds.has(r.pred_task_id)) continue;
      const pt = p.tasks.find((t) => t.id === +r.pred_task_id);
      const hrs = (calBy.get(String(pt && pt.cal)) || p.cals[0]).hrs || 8;
      p.rels.push({ id: +r.task_pred_id || ++p.nid, p: +r.pred_task_id, s: +r.task_id, type: (r.pred_type || 'PR_FS').replace('PR_', ''), lag: r2(num(r.lag_hr_cnt) / hrs) });
    }
    // resources
    const rs = T('RSRC');
    const usedR = new Set();
    for (const a of T('TASKRSRC')) if (taskIds.has(a.task_id)) { usedR.add(a.rsrc_id); p.asg.push({ id: +a.taskrsrc_id || ++p.nid, task: +a.task_id, rsrc: +a.rsrc_id, qty: r2(num(a.target_qty)) }); }
    for (const r of rs) if (usedR.has(r.rsrc_id)) p.rsrc.push({ id: +r.rsrc_id, name: r.rsrc_name, short: r.rsrc_short_name, role: r.rsrc_title_name || '', units: r2(num(r.def_qty_per_hr) * 8) || 8, type: r.rsrc_type || 'RT_Labor' });
    // resource prices
    const rate = new Map();
    for (const r of T('RSRCRATE')) { const c = num(r.cost_per_qty); const d = r.start_date || ''; const cur = rate.get(r.rsrc_id); if (!cur || d < cur.d) rate.set(r.rsrc_id, { d, c }); }
    for (const r of p.rsrc) { const x = rate.get(String(r.id)); r.price = x ? x.c : 0; }
    // assignments: actual / remaining units
    const taskPct = new Map(p.tasks.map((x) => [x.id, x]));
    for (const a of T('TASKRSRC')) {
      if (!taskIds.has(a.task_id)) continue;
      const mine = p.asg.find((q) => q.id === (+a.taskrsrc_id)); if (!mine) continue;
      const act = num(a.act_reg_qty) + num(a.act_ot_qty), rem = num(a.remain_qty), tk = taskPct.get(+a.task_id);
      const auto = mine.qty * (tk.status === 'C' ? 1 : (tk.pct || 0) / 100);
      if (Math.abs(act - auto) > Math.max(0.5, mine.qty * 0.01)) { mine.manual = true; mine.act = r2(act); mine.rem = r2(rem); }
    }
    // expenses
    for (const r of T('PROJCOST')) { const tk = taskPct.get(+r.task_id); if (tk && r.proj_id === projId) tk.exp = r2((tk.exp || 0) + num(r.target_cost)); }
    // steps
    for (const r of T('TASKPROC')) { const tk = taskPct.get(+r.task_id); if (tk && r.proj_id === projId) tk.steps.push({ id: +r.proc_id || ++p.nid, name: r.proc_name, wt: num(r.proc_wt) || 1, done: r.complete_flag === 'Y' }); }
    for (const tk of p.tasks) tk.steps.sort((a, b) => a.id - b.id);
    // activity codes (global + project)
    const ctypes = T('ACTVTYPE').filter((r) => !r.proj_id || r.proj_id === projId);
    for (const r of ctypes) p.codeTypes.push({ id: +r.actv_code_type_id, name: r.actv_code_type, scope: r.proj_id ? 'project' : 'global', len: +r.actv_short_len || 20 });
    const ctIds = new Set(p.codeTypes.map((x) => x.id));
    for (const r of T('ACTVCODE')) if (ctIds.has(+r.actv_code_type_id)) p.codeVals.push({ id: +r.actv_code_id, type: +r.actv_code_type_id, short: r.short_name, name: r.actv_code_name, parent: r.parent_actv_code_id ? +r.parent_actv_code_id : null, color: r.color || '' });
    for (const r of T('TASKACTV')) { const tk = taskPct.get(+r.task_id); if (tk && ctIds.has(+r.actv_code_type_id)) tk.codes[r.actv_code_type_id] = +r.actv_code_id; }
    // project codes
    for (const r of T('PCATTYPE')) p.pcTypes.push({ id: +r.proj_catg_type_id, name: r.proj_catg_type, len: +r.proj_catg_short_len || 20 });
    const pcIds = new Set(p.pcTypes.map((x) => x.id));
    for (const r of T('PCATVAL')) if (pcIds.has(+r.proj_catg_type_id)) p.pcVals.push({ id: +r.proj_catg_id, type: +r.proj_catg_type_id, short: r.proj_catg_short_name, name: r.proj_catg_name, parent: r.parent_proj_catg_id ? +r.parent_proj_catg_id : null });
    for (const r of T('PROJPCAT')) if (r.proj_id === projId) p.pcAssign[r.proj_catg_type_id] = +r.proj_catg_id;
    // user-defined fields on activities
    const ud = new Map();
    for (const r of T('UDFTYPE')) if (r.table_name === 'TASK') {
      const ty = /INT|DOUBLE|FLOAT/.test(r.logical_data_type) ? 'number' : /MONEY|COST/.test(r.logical_data_type) ? 'cost' : /DATE/.test(r.logical_data_type) ? 'date' : 'text';
      const u = { id: +r.udf_type_id, name: r.udf_type_label || r.udf_type_name, ty }; p.udfs.push(u); ud.set(r.udf_type_id, u);
    }
    for (const r of T('UDFVALUE')) { const u = ud.get(r.udf_type_id), tk = taskPct.get(+r.fk_id); if (!u || !tk) continue; tk.udf[u.id] = u.ty === 'date' ? toDay(r.udf_date) : u.ty === 'text' ? r.udf_text : num(r.udf_number); }
    for (const w of p.wbs) p.nid = Math.max(p.nid, w.id);
    for (const r of p.rels) p.nid = Math.max(p.nid, r.id);
    for (const r of p.rsrc) p.nid = Math.max(p.nid, r.id);
    for (const r of p.asg) p.nid = Math.max(p.nid, r.id);
    for (const x of [...p.codeTypes, ...p.codeVals, ...p.pcTypes, ...p.pcVals, ...p.udfs]) p.nid = Math.max(p.nid, x.id);
    p.imported = true; // keep file dates until the user edits / reschedules
    return p;
  }

  // ================= XER writing =================
  const tsv = (a) => a.map((v) => (v == null ? '' : String(v).replace(/[\t\r\n]+/g, ' '))).join('\t');
  const dstr = (d, end, hrs) => (d == null ? '' : fromDay(d) + ' ' + (end ? String(8 + Math.round(hrs || 8)).padStart(2, '0') : '08') + ':00');
  const lagFmt = (n) => String(Math.round(n * 1000) / 1000);

  const F = {
    PROJECT: 'proj_id fy_start_month_num rsrc_self_add_flag allow_complete_flag rsrc_multi_assign_flag checkout_flag project_flag step_complete_flag cost_qty_recalc_flag batch_sum_flag name_sep_char def_complete_pct_type proj_short_name clndr_id task_code_base task_code_step priority_num wbs_max_sum_level strgy_priority_num critical_drtn_hr_cnt def_cost_per_qty last_recalc_date plan_start_date plan_end_date scd_end_date add_date def_duration_type task_code_prefix def_qty_type add_by_name def_task_type act_pct_link_flag critical_path_type def_rollup_dates_flag use_project_baseline_flag'.split(' '),
    CALENDAR: 'clndr_id default_flag clndr_name proj_id base_clndr_id last_chng_date clndr_type day_hr_cnt week_hr_cnt month_hr_cnt year_hr_cnt rsrc_private clndr_data'.split(' '),
    PROJWBS: 'wbs_id proj_id obs_id seq_num est_wt proj_node_flag sum_data_flag status_code wbs_short_name wbs_name phase_id parent_wbs_id ev_user_pct ev_etc_user_value orig_cost indep_remain_total_cost ann_dscnt_rate_pct dscnt_period_cd indep_remain_work_qty anticip_start_date anticip_end_date ev_compute_type ev_etc_compute_type'.split(' '),
    TASK: 'task_id proj_id wbs_id clndr_id phys_complete_pct rev_fdbk_flag est_wt lock_plan_flag auto_compute_act_flag complete_pct_type task_type duration_type status_code task_code task_name rsrc_id total_float_hr_cnt free_float_hr_cnt remain_drtn_hr_cnt act_work_qty remain_work_qty target_work_qty target_drtn_hr_cnt target_equip_qty act_equip_qty remain_equip_qty cstr_date act_start_date act_end_date late_start_date late_end_date expect_end_date early_start_date early_end_date restart_date reend_date target_start_date target_end_date rem_late_start_date rem_late_end_date cstr_type priority_type suspend_date resume_date float_path float_path_order cstr_date2 cstr_type2 driving_path_flag'.split(' '),
    TASKPRED: 'task_pred_id task_id pred_task_id proj_id pred_proj_id pred_type lag_hr_cnt comments float_path aref arls'.split(' '),
    RSRC: 'rsrc_id parent_rsrc_id clndr_id role_id shift_id user_id pobs_id guid rsrc_seq_num email_addr employee_code office_phone other_phone rsrc_name rsrc_short_name rsrc_title_name def_qty_per_hr cost_qty_type ot_factor active_flag auto_compute_act_flag def_cost_qty_link_flag ot_flag curr_id unit_id rsrc_type location_id rsrc_notes load_tasks_flag level_flag last_checksum'.split(' '),
    TASKRSRC: 'taskrsrc_id task_id proj_id cost_qty_link_flag role_id acct_id rsrc_id pobs_id skill_level remain_qty target_qty remain_qty_per_hr target_lag_drtn_hr_cnt target_qty_per_hr act_ot_qty act_reg_qty relag_drtn_hr_cnt ot_factor cost_per_qty target_cost act_reg_cost act_ot_cost remain_cost act_start_date act_end_date restart_date reend_date target_start_date target_end_date rem_late_start_date rem_late_end_date rollup_dates_flag target_crv remain_crv actual_crv ts_pend_act_end_flag guid rsrc_type'.split(' ')
  };
  Object.assign(F, {
    RSRCRATE: 'rsrc_rate_id rsrc_id max_qty_per_hr cost_per_qty cost_per_qty2 cost_per_qty3 cost_per_qty4 cost_per_qty5 start_date shift_period_id'.split(' '),
    PROJCOST: 'cost_item_id proj_id task_id cost_name po_number vendor_name act_this_per_cost target_cost act_cost remain_cost'.split(' '),
    TASKPROC: 'proc_id task_id proj_id seq_num proc_name complete_flag proc_wt complete_pct proc_descr'.split(' '),
    ACTVTYPE: 'actv_code_type_id actv_short_len seq_num actv_code_type proj_id wbs_id actv_code_type_scope super_flag'.split(' '),
    ACTVCODE: 'actv_code_id parent_actv_code_id actv_code_type_id actv_code_name short_name seq_num color total_assignments'.split(' '),
    TASKACTV: 'task_id actv_code_type_id actv_code_id proj_id'.split(' '),
    PCATTYPE: 'proj_catg_type_id proj_catg_short_len seq_num proj_catg_type export_flag super_flag'.split(' '),
    PCATVAL: 'proj_catg_id proj_catg_type_id proj_catg_short_name proj_catg_name parent_proj_catg_id seq_num'.split(' '),
    PROJPCAT: 'proj_id proj_catg_type_id proj_catg_id'.split(' '),
    UDFTYPE: 'udf_type_id table_name udf_type_name udf_type_label logical_data_type super_flag indicator_expression summary_indicator_expression export_flag'.split(' '),
    UDFVALUE: 'udf_type_id fk_id proj_id udf_date udf_number udf_text udf_code_id'.split(' ')
  });
  const HANDLED = new Set(['PROJECT', 'CALENDAR', 'PROJWBS', 'TASK', 'TASKPRED', 'RSRC', 'TASKRSRC', 'RSRCRATE', 'PROJCOST', 'TASKPROC', 'ACTVTYPE', 'ACTVCODE', 'TASKACTV', 'PCATTYPE', 'PCATVAL', 'PROJPCAT', 'UDFTYPE', 'UDFVALUE']);
  const OPTIONAL = new Set(['RSRCRATE', 'PROJCOST', 'TASKPROC', 'ACTVTYPE', 'ACTVCODE', 'TASKACTV', 'PCATTYPE', 'PCATVAL', 'PROJPCAT', 'UDFTYPE', 'UDFVALUE']);

  function pushAll(a, b) { for (let i = 0; i < b.length; i++) a.push(b[i]); }
  function tableOut(name, fields, rows) {
    const L = ['%T\t' + name, '%F\t' + fields.join('\t')];
    for (const r of rows) L.push('%R\t' + tsv(fields.map((f) => (r[f] == null ? '' : r[f]))));
    return L;
  }

  function optionalRows(name, p, projId, rt) {
    const rows = [], tk = p.tasks;
    switch (name) {
      case 'RSRCRATE': for (const r of p.rsrc) if (r.price) rows.push({ rsrc_rate_id: r.id, rsrc_id: r.id, max_qty_per_hr: (r.units || 8) / 8, cost_per_qty: r.price, start_date: dstr(p.planStart) }); break;
      case 'PROJCOST': for (const t of tk) if (t.exp) rows.push({ cost_item_id: t.id, proj_id: projId, task_id: t.id, cost_name: 'Expense', target_cost: t.exp, act_cost: lagFmt(t.exp * (t.status === 'C' ? 1 : (t.pct || 0) / 100)), remain_cost: lagFmt(t.exp * (t.status === 'C' ? 0 : 1 - (t.pct || 0) / 100)) }); break;
      case 'TASKPROC': for (const t of tk) t.steps.forEach((s, i) => rows.push({ proc_id: s.id, task_id: t.id, proj_id: projId, seq_num: i + 1, proc_name: s.name, complete_flag: s.done ? 'Y' : 'N', proc_wt: s.wt, complete_pct: s.done ? 100 : 0 })); break;
      case 'ACTVTYPE': p.codeTypes.forEach((c, i) => rows.push({ actv_code_type_id: c.id, actv_short_len: c.len || 20, seq_num: i + 1, actv_code_type: c.name, proj_id: c.scope === 'project' ? projId : '', actv_code_type_scope: c.scope === 'project' ? 'AS_Project' : 'AS_Global', super_flag: 'N' })); break;
      case 'ACTVCODE': p.codeVals.forEach((v, i) => rows.push({ actv_code_id: v.id, parent_actv_code_id: v.parent == null ? '' : v.parent, actv_code_type_id: v.type, actv_code_name: v.name, short_name: v.short, seq_num: i + 1, color: v.color || '' })); break;
      case 'TASKACTV': for (const t of tk) for (const k of Object.keys(t.codes || {})) if (t.codes[k] != null && p.codeVals.some((v) => v.id === t.codes[k])) rows.push({ task_id: t.id, actv_code_type_id: k, actv_code_id: t.codes[k], proj_id: projId }); break;
      case 'PCATTYPE': p.pcTypes.forEach((c, i) => rows.push({ proj_catg_type_id: c.id, proj_catg_short_len: c.len || 20, seq_num: i + 1, proj_catg_type: c.name, export_flag: 'Y', super_flag: 'N' })); break;
      case 'PCATVAL': p.pcVals.forEach((v, i) => rows.push({ proj_catg_id: v.id, proj_catg_type_id: v.type, proj_catg_short_name: v.short, proj_catg_name: v.name, parent_proj_catg_id: v.parent == null ? '' : v.parent, seq_num: i + 1 })); break;
      case 'PROJPCAT': for (const k of Object.keys(p.pcAssign || {})) if (p.pcAssign[k] != null) rows.push({ proj_id: projId, proj_catg_type_id: k, proj_catg_id: p.pcAssign[k] }); break;
      case 'UDFTYPE': p.udfs.forEach((u) => rows.push({ udf_type_id: u.id, table_name: 'TASK', udf_type_name: u.name.replace(/\s+/g, '_'), udf_type_label: u.name, logical_data_type: u.ty === 'number' ? 'FT_FLOAT' : u.ty === 'cost' ? 'FT_MONEY' : u.ty === 'date' ? 'FT_START_DATE' : 'FT_TEXT', super_flag: 'N', export_flag: 'Y' })); break;
      case 'UDFVALUE': for (const t of tk) for (const u of p.udfs) { const v = (t.udf || {})[u.id]; if (v == null || v === '') continue; rows.push({ udf_type_id: u.id, fk_id: t.id, proj_id: projId, udf_date: u.ty === 'date' ? dstr(v) : '', udf_number: u.ty === 'number' || u.ty === 'cost' ? v : '', udf_text: u.ty === 'text' ? v : '' }); } break;
      default: break;
    }
    return rows;
  }
  function toXER(p) {
    const raw = p.xer ? p.xer.x : null;
    const projId = p.xer ? p.xer.projId : '1';
    const today = fromDay(P6.todayDay()) + ' 00:00';
    const calBy = new Map(p.cals.map((c) => [c.id, c]));
    const defCal = calBy.get(p.defCal) || p.cals[0];
    const rawT = (n) => (raw && raw.tables[n] ? raw.tables[n] : null);
    const lines = [];
    const hdr = raw && raw.header ? raw.header : ['8.4', fromDay(P6.todayDay()), 'Project', 'admin', 'admin', 'P6Web', 'Project Management', 'USD'];
    lines.push('ERMHDR\t' + hdr.join('\t'));

    // keep non-handled tables from the original file
    const ordered = [];
    if (raw) for (const n of raw.order) ordered.push(n);
    for (const n of Object.keys(HANDLED.size ? F : {})) if (!ordered.includes(n)) ordered.push(n);
    const taskIds = new Set(p.tasks.map((t) => String(t.id)));
    if (!raw) pushAll(lines, tableOut('CURRTYPE', ['curr_id', 'decimal_digit_cnt', 'curr_symbol', 'decimal_symbol', 'digit_group_symbol', 'pos_curr_fmt_type', 'neg_curr_fmt_type', 'curr_type', 'curr_short_name', 'group_digit_cnt', 'base_exch_rate'], [{ curr_id: 1, decimal_digit_cnt: 2, curr_symbol: '$', decimal_symbol: '.', digit_group_symbol: ',', pos_curr_fmt_type: '#1.1', neg_curr_fmt_type: '(#1.1)', curr_type: 'US Dollar', curr_short_name: 'USD', group_digit_cnt: 3, base_exch_rate: 1 }]));

    for (const name of ordered) {
      const rt = rawT(name);
      if (name === 'CURRTYPE' && !raw) continue;
      if (!HANDLED.has(name)) {
        if (!rt) continue;
        let rows = rt.rows;
        if (rt.fields.includes('proj_id')) rows = rows.filter((r) => !r.proj_id || r.proj_id === projId);
        if (rt.fields.includes('task_id')) rows = rows.filter((r) => taskIds.has(r.task_id));
        pushAll(lines, tableOut(name, rt.fields, rows));
        continue;
      }
      const fields = rt && rt.fields.length ? rt.fields : F[name];
      if (name === 'PROJECT') {
        const base = rt ? rt.rows.find((r) => r.proj_id === projId) || {} : {};
        const row = Object.assign({
          proj_id: projId, fy_start_month_num: 1, rsrc_self_add_flag: 'Y', allow_complete_flag: 'Y', rsrc_multi_assign_flag: 'Y', checkout_flag: 'N', project_flag: 'Y', step_complete_flag: 'N', cost_qty_recalc_flag: 'N', batch_sum_flag: 'Y', name_sep_char: '.', def_complete_pct_type: 'CP_Drtn', task_code_base: 1000, task_code_step: 10, priority_num: 10, wbs_max_sum_level: 0, strgy_priority_num: 500, critical_drtn_hr_cnt: 0, def_cost_per_qty: 0, add_date: today, def_duration_type: 'DT_FixedDUR2', task_code_prefix: 'A', def_qty_type: 'QT_Hour', add_by_name: 'admin', def_task_type: 'TT_Task', act_pct_link_flag: 'Y', critical_path_type: 'CT_TotFloat', def_rollup_dates_flag: 'Y', use_project_baseline_flag: 'N'
        }, base, {
          proj_short_name: p.name, clndr_id: defCal.id, last_recalc_date: dstr(p.dataDate), plan_start_date: dstr(p.planStart),
          plan_end_date: p.mustFinish != null ? dstr(p.mustFinish, true, 8) : '', scd_end_date: dstr(p.finish, true, 8)
        });
        pushAll(lines, tableOut(name, fields, [row]));
      } else if (name === 'CALENDAR') {
        const rows = p.cals.map((c) => {
          const rr = Object.assign({ default_flag: c === defCal ? 'Y' : 'N', clndr_type: 'CA_Base', proj_id: '', week_hr_cnt: c.hrs * 5, month_hr_cnt: c.hrs * 21.5, year_hr_cnt: c.hrs * 260, rsrc_private: 'N' }, c.rawRow || {});
          rr.clndr_id = c.id; rr.clndr_name = c.name; rr.day_hr_cnt = c.hrs;
          if (!c.rawRow || c.mod) rr.clndr_data = calToData(c);
          return rr;
        });
        pushAll(lines, tableOut(name, fields, rows));
      } else if (name === 'PROJWBS') {
        const rawBy = new Map(rt ? rt.rows.map((r) => [r.wbs_id, r]) : []);
        const rows = p.wbs.map((w, i) => Object.assign({ obs_id: '', est_wt: 1, sum_data_flag: 'Y', status_code: 'WS_Open', ev_compute_type: 'EC_Cmp_pct', ev_etc_compute_type: 'EE_Rem_hr' }, rawBy.get(String(w.id)) || {}, {
          wbs_id: w.id, proj_id: projId, seq_num: w.seq != null ? w.seq : i, proj_node_flag: w.parent == null ? 'Y' : 'N',
          wbs_short_name: w.code, wbs_name: w.name, parent_wbs_id: w.parent == null ? '' : w.parent
        }));
        pushAll(lines, tableOut(name, fields, rows));
      } else if (name === 'TASK') {
        const rawBy = new Map(rt ? rt.rows.map((r) => [r.task_id, r]) : []);
        const rows = p.tasks.map((t) => {
          const cal = calBy.get(t.cal) || defCal, h = cal.hrs || 8;
          const ip = t.status === 'IP', c = t.status === 'C';
          return Object.assign({ rev_fdbk_flag: 'N', est_wt: 1, lock_plan_flag: 'N', auto_compute_act_flag: 'Y', duration_type: 'DT_FixedDUR2', priority_type: 'PT_Normal', driving_path_flag: 'N' }, rawBy.get(String(t.id)) || {}, {
            task_id: t.id, proj_id: projId, wbs_id: t.wbs, clndr_id: cal.id, duration_type: t.dtype || 'DT_FixedDUR2', rev_fdbk_flag: t.rev ? 'Y' : 'N',
            phys_complete_pct: t.pctType === 'phys' ? t.pct : (t.phys || 0),
            complete_pct_type: t.pctType === 'phys' ? 'CP_Phys' : t.pctType === 'units' ? 'CP_Units' : 'CP_Drtn',
            task_type: t.type, status_code: STAT_REV[t.status], task_code: t.code, task_name: t.name,
            total_float_hr_cnt: c || t.tf == null ? '' : lagFmt(t.tf * h), free_float_hr_cnt: c || t.ff == null ? '' : lagFmt(t.ff * h),
            remain_drtn_hr_cnt: c ? 0 : lagFmt(t.rem * h), target_drtn_hr_cnt: lagFmt(t.dur * h),
            cstr_date: t.ct ? dstr(t.cd) : '', cstr_type: t.ct ? CSTR_REV[t.ct] : '',
            act_start_date: dstr(t.as), act_end_date: dstr(t.af, true, h),
            late_start_date: c ? '' : dstr(t.ls), late_end_date: c ? '' : dstr(t.lf, true, h),
            early_start_date: c ? dstr(t.as) : dstr(ip ? t.rs : t.es), early_end_date: dstr(t.ef, true, h),
            restart_date: c ? '' : dstr(t.rs != null ? t.rs : t.es), reend_date: c ? '' : dstr(t.ef, true, h),
            target_start_date: dstr(t.bs != null ? t.bs : t.es), target_end_date: dstr(t.bf != null ? t.bf : t.ef, true, h),
            rem_late_start_date: c ? '' : dstr(t.ls), rem_late_end_date: c ? '' : dstr(t.lf, true, h)
          });
        });
        pushAll(lines, tableOut(name, fields, rows));
      } else if (name === 'TASKPRED') {
        const rawBy = new Map(rt ? rt.rows.map((r) => [r.task_pred_id, r]) : []);
        const byId = new Map(p.tasks.map((t) => [t.id, t]));
        const rows = p.rels.filter((r) => byId.has(r.p) && byId.has(r.s)).map((r) => {
          const h = (calBy.get(byId.get(r.p).cal) || defCal).hrs || 8;
          return Object.assign({}, rawBy.get(String(r.id)) || {}, { task_pred_id: r.id, task_id: r.s, pred_task_id: r.p, proj_id: projId, pred_proj_id: projId, pred_type: 'PR_' + r.type, lag_hr_cnt: lagFmt(r.lag * h) });
        });
        pushAll(lines, tableOut(name, fields, rows));
      } else if (name === 'RSRC') {
        const rawBy = new Map(rt ? rt.rows.map((r) => [r.rsrc_id, r]) : []);
        const rows = p.rsrc.map((r) => Object.assign({ active_flag: 'Y', auto_compute_act_flag: 'Y', def_cost_qty_link_flag: 'Y', ot_flag: 'N', curr_id: 1, def_qty_per_hr: 1, load_tasks_flag: 'N', level_flag: 'N' }, rawBy.get(String(r.id)) || {}, { rsrc_id: r.id, rsrc_name: r.name, rsrc_short_name: r.short || r.name, rsrc_title_name: r.role || '', def_qty_per_hr: (r.units || 8) / 8, rsrc_type: r.type }));
        pushAll(lines, tableOut(name, fields, rows));
      } else if (OPTIONAL.has(name)) {
        const rows = optionalRows(name, p, projId, rt);
        if (rows.length || rt) pushAll(lines, tableOut(name, fields, rows));
      } else if (name === 'TASKRSRC') {
        const rawBy = new Map(rt ? rt.rows.map((r) => [r.taskrsrc_id, r]) : []);
        const tmap = new Map(p.tasks.map((x) => [x.id, x])), rmap = new Map(p.rsrc.map((x) => [x.id, x]));
        const rows = p.asg.filter((a) => taskIds.has(String(a.task))).map((a) => {
          const sp = P6.asgSplit(a, tmap.get(a.task)), price = (rmap.get(a.rsrc) || {}).price || 0;
          return Object.assign({ cost_qty_link_flag: 'Y', rollup_dates_flag: 'Y' }, rawBy.get(String(a.id)) || {}, { taskrsrc_id: a.id, task_id: a.task, proj_id: projId, rsrc_id: a.rsrc, target_qty: a.qty, remain_qty: lagFmt(sp.rem), act_reg_qty: lagFmt(sp.act), cost_per_qty: price, target_cost: lagFmt(a.qty * price), act_reg_cost: lagFmt(sp.act * price), remain_cost: lagFmt(sp.rem * price) });
        });
        pushAll(lines, tableOut(name, fields, rows));
      }
    }
    lines.push('%E');
    return lines.join('\r\n') + '\r\n';
  }

  // ================= PMXML (read) =================
  function fromPMXML(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid XML');
    const el = (parent, tag) => { for (const c of parent.children) if (c.localName === tag) return c; return null; };
    const val = (parent, tag) => { const e = el(parent, tag); return e ? e.textContent.trim() : ''; };
    const all = (tag, parent) => Array.from((parent || doc).getElementsByTagNameNS('*', tag));
    const proj = all('Project')[0];
    if (!proj) throw new Error('No <Project> element');
    const p = P6.newProject(val(proj, 'Name') || val(proj, 'Id') || 'Project');
    p.cals = []; p.wbs = []; p.tasks = [];
    p.planStart = toDay(val(proj, 'PlannedStartDate')) ?? P6.todayDay();
    p.dataDate = toDay(val(proj, 'DataDate')) ?? p.planStart;
    for (const c of all('Calendar')) {
      const id = +val(c, 'ObjectId');
      const cal = P6.newCal(id, val(c, 'Name'), P6.WEEKS.sunThu);
      cal.hrs = parseFloat(val(c, 'HoursPerDay')) || 8;
      p.cals.push(cal);
    }
    if (!p.cals.length) p.cals.push(P6.newCal(1, 'Standard'));
    p.defCal = p.cals[0].id;
    const wMap = new Map();
    for (const w of all('WBS')) {
      const id = +val(w, 'ObjectId');
      wMap.set(id, true);
      p.wbs.push({ id, parent: val(w, 'ParentObjectId') ? +val(w, 'ParentObjectId') : null, code: val(w, 'Code'), name: val(w, 'Name'), seq: +val(w, 'SequenceNumber') || 0 });
    }
    if (!p.wbs.length) p.wbs.push({ id: 1, parent: null, code: 'P1', name: p.name, seq: 0 });
    for (const w of p.wbs) if (w.parent != null && !wMap.has(w.parent)) w.parent = null;
    const calBy = new Map(p.cals.map((c) => [c.id, c]));
    const tType = { 'Task Dependent': 'TT_Task', 'Resource Dependent': 'TT_Rsrc', 'Start Milestone': 'TT_Mile', 'Finish Milestone': 'TT_FinMile', 'Level of Effort': 'TT_LOE', 'WBS Summary': 'TT_WBS' };
    const cMap = { 'Start On or After': 'SNET', 'Start On or Before': 'SNLT', 'Finish On or After': 'FNET', 'Finish On or Before': 'FNLT', 'Mandatory Start': 'MSO', 'Mandatory Finish': 'MFO', 'As Late as Possible': 'ALAP' };
    p.tasks = all('Activity').map((a, i) => {
      const calId = +val(a, 'CalendarObjectId') || p.defCal;
      const cal = calBy.get(calId) || p.cals[0];
      const h = cal.hrs || 8;
      const st = val(a, 'Status');
      const status = st === 'Completed' ? 'C' : st === 'In Progress' ? 'IP' : 'NS';
      const t = P6.newTask(p, +val(a, 'WBSObjectId') || p.wbs[0].id, { id: +val(a, 'ObjectId') || ++p.nid, code: val(a, 'Id'), name: val(a, 'Name'), type: tType[val(a, 'Type')] || 'TT_Task', cal: cal.id, status, seq: i });
      p.nid = Math.max(p.nid, t.id);
      t.dur = r2(num(val(a, 'PlannedDuration')) / h || num(val(a, 'OriginalDuration')) / h);
      t.rem = status === 'C' ? 0 : r2(num(val(a, 'RemainingDuration')) / h);
      t.as = toDay(val(a, 'ActualStartDate')); t.af = toDay(val(a, 'ActualFinishDate'));
      t.es = toDay(val(a, 'StartDate')); t.ef = toDay(val(a, 'FinishDate'));
      t.bs = toDay(val(a, 'PlannedStartDate')); t.bf = toDay(val(a, 'PlannedFinishDate'));
      t.ct = cMap[val(a, 'PrimaryConstraintType')] || ''; t.cd = t.ct ? toDay(val(a, 'PrimaryConstraintDate')) : null;
      t.pct = status === 'C' ? 100 : status === 'NS' || !(t.dur > 0) ? 0 : Math.round(((t.dur - t.rem) / t.dur) * 100);
      return t;
    });
    const ids = new Set(p.tasks.map((t) => t.id));
    const rt = { 'Finish to Start': 'FS', 'Start to Start': 'SS', 'Finish to Finish': 'FF', 'Start to Finish': 'SF' };
    for (const r of all('Relationship')) {
      const a = +val(r, 'PredecessorActivityObjectId'), b = +val(r, 'SuccessorActivityObjectId');
      if (ids.has(a) && ids.has(b)) p.rels.push({ id: ++p.nid, p: a, s: b, type: rt[val(r, 'Type')] || 'FS', lag: r2(num(val(r, 'Lag')) / 8) });
    }
    p.imported = true;
    return p;
  }

  // ================= CSV =================
  function parseDelimited(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }
  const csvCell = (v) => { v = v == null ? '' : String(v); return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

  const CSV_COLS = [
    ['Activity ID', (t) => t.code], ['Activity Name', (t) => t.name], ['WBS', (t, p) => (p.wbs.find((w) => w.id === t.wbs) || {}).code],
    ['Activity Type', (t) => t.type], ['Status', (t) => ({ NS: 'Not Started', IP: 'In Progress', C: 'Completed' })[t.status]],
    ['Original Duration', (t) => t.dur], ['Remaining Duration', (t) => t.rem], ['% Complete', (t) => t.pct],
    ['Start', (t) => P6.fmtDate(t.es)], ['Finish', (t) => P6.fmtDate(t.ef)],
    ['Actual Start', (t) => P6.fmtDate(t.as)], ['Actual Finish', (t) => P6.fmtDate(t.af)],
    ['Total Float', (t) => (t.tf == null ? '' : t.tf)], ['Free Float', (t) => (t.ff == null ? '' : t.ff)],
    ['Predecessors', (t, p) => P6.relText(p, t)], ['Constraint', (t) => (t.ct ? t.ct + ' ' + P6.fmtDate(t.cd) : '')],
    ['Baseline Start', (t) => P6.fmtDate(t.bs)], ['Baseline Finish', (t) => P6.fmtDate(t.bf)]
  ];
  function toCSV(p) {
    const L = [CSV_COLS.map((c) => csvCell(c[0])).join(',')];
    for (const t of p.tasks) L.push(CSV_COLS.map((c) => csvCell(c[1](t, p))).join(','));
    return '﻿' + L.join('\r\n');
  }



  // import activities (id, name, duration, predecessors, wbs ...) from CSV rows; returns {added, updated, rels}
  function importRows(p, rows, defWbs) {
    if (rows.length < 2) return { added: 0, updated: 0 };
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ%]/g, '');
    const alias = {
      code: ['activityid', 'id', 'code', 'taskid', 'رقمالنشاط', 'كود', 'الكود'],
      name: ['activityname', 'name', 'taskname', 'description', 'اسمالنشاط', 'النشاط', 'الاسم', 'الوصف'],
      dur: ['originalduration', 'duration', 'dur', 'od', 'المدة', 'مدة'],
      pred: ['predecessors', 'predecessor', 'pred', 'preds', 'السوابق', 'سوابق'],
      start: ['start', 'startdate', 'plannedstart', 'البداية', 'تاريخالبدء'],
      finish: ['finish', 'finishdate', 'end', 'plannedfinish', 'النهاية', 'تاريخالانتهاء'],
      pct: ['complete', 'percentcomplete', '%complete', 'pct', 'progress', 'نسبةالانجاز', 'الانجاز'],
      wbs: ['wbs', 'wbscode', 'wbsname', 'هيكل'],
      type: ['activitytype', 'type', 'النوع']
    };
    const head = rows[0].map(norm);
    const col = {};
    for (const k in alias) { const i = head.findIndex((h) => alias[k].includes(h)); if (i >= 0) col[k] = i; }
    if (col.name == null) return { added: 0, updated: 0, error: 'noname' };
    let added = 0, updated = 0;
    const byCode = new Map(p.tasks.map((t) => [t.code.toLowerCase(), t]));
    const wbsBy = (v) => {
      if (!v) return defWbs;
      const w = p.wbs.find((x) => x.code === v || x.name === v);
      if (w) return w.id;
      const nw = { id: P6.nextId(p), parent: p.wbs.find((x) => x.parent == null).id, code: v, name: v, seq: p.wbs.length };
      p.wbs.push(nw);
      return nw.id;
    };
    const predLater = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const g = (k) => (col[k] == null ? '' : (r[col[k]] || '').trim());
      const name = g('name');
      if (!name) continue;
      const code = g('code');
      let t = code ? byCode.get(code.toLowerCase()) : null;
      if (t) updated++; else { t = P6.newTask(p, wbsBy(g('wbs')), { code: code || undefined }); p.tasks.push(t); byCode.set(t.code.toLowerCase(), t); added++; }
      t.name = name;
      if (col.wbs != null && g('wbs')) t.wbs = wbsBy(g('wbs'));
      if (g('dur') !== '') { const d = parseFloat(g('dur')); if (isFinite(d)) { t.dur = Math.max(0, d); if (t.status === 'NS') t.rem = t.dur; } }
      if (g('type')) t.type = /fin/i.test(g('type')) ? 'TT_FinMile' : /mile/i.test(g('type')) ? 'TT_Mile' : 'TT_Task';
      if (t.type === 'TT_Task' && g('dur') !== '' && t.dur === 0) t.type = 'TT_Mile';
      if (t.type !== 'TT_Task') { t.dur = 0; t.rem = 0; }
      const st = P6.parseDate(g('start'));
      if (st != null) { t.ct = 'SNET'; t.cd = st; }
      if (g('pct') !== '') { const pc = parseFloat(g('pct')); if (isFinite(pc)) { t.pct = Math.max(0, Math.min(100, pc)); if (pc >= 100) { t.status = 'C'; t.as = t.as ?? p.dataDate; t.af = t.af ?? p.dataDate; t.rem = 0; } else if (pc > 0) { t.status = 'IP'; t.as = t.as ?? p.dataDate; t.rem = Math.round(t.dur * (1 - pc / 100) * 100) / 100; } } }
      if (g('pred')) predLater.push([t, g('pred')]);
    }
    let rels = 0;
    for (const [t, txt] of predLater) {
      const { rels: rr } = P6.parsePreds(p, txt, t);
      for (const x of rr) {
        if (p.rels.some((q) => q.p === x.p && q.s === t.id)) continue;
        if (P6.wouldLoop(p, x.p, t.id)) continue;
        p.rels.push({ id: P6.nextId(p), p: x.p, s: t.id, type: x.type, lag: x.lag }); rels++;
      }
    }
    return { added, updated, rels };
  }

  Object.assign(P6, { parseXER, decodeBuffer, xerProjects, fromXER, toXER, fromPMXML, parseDelimited, toCSV, importRows, calToData, CSV_COLS });
  if (typeof module !== 'undefined' && module.exports) module.exports = P6;
})(typeof globalThis !== 'undefined' ? globalThis : window);
