# XER Field Mapping

All Primavera P6 columns read by the application are declared in **one place**:
`sar_pcd/core/xer_fields.py`. The loader (`sar_pcd/core/loader.py`) requests fields by
*application key* (e.g. `task.orig_dur_hours`), never by raw column name, so a new
P6 / XER version is supported by editing that table (add an alternate column name or
change the status) - the analytics engine does not change.

## Verification status

| Status | Meaning |
|---|---|
| VERIFIED | Meaning confirmed against the P6 data dictionary for the table (P6 v8.x - v23). |
| VERSION-DEPENDENT | Column exists only in some P6 versions / export options. Its presence is checked and features degrade gracefully when absent (for example the Longest Path is computed when `driving_path_flag` is missing). |
| UNVERIFIED | Meaning believed correct but not confirmed for every version - results depending on it are flagged. (No field in the current mapping is in this state.) |

## Important interpretations

* **Data Date** = `PROJECT.last_recalc_date`. `next_data_date` is not the data date.
* **Project Name** = `PROJWBS.wbs_name` of the row with `proj_node_flag = 'Y'` (the PROJECT table holds only the short ID).
* **TASK.target_start_date / target_end_date** are P6 *Planned* dates, **not baseline dates**. Baseline dates always come from the Approved Baseline XER (its activities' Start/Finish).
* **Start** = Actual Start, else Early Start. **Finish** = Actual Finish when complete, else Early Finish.
* **Durations and float** are stored in **hours**; days = hours / calendar `day_hr_cnt` of the activity's calendar.
* **Calendar data** (`CALENDAR.clndr_data`): days `1..7` = Sunday..Saturday; exception dates are serial numbers counted from 1899-12-30; an exception without work intervals is a non-working day. Line breaks may be encoded as `0x7F`.
* **Costs**: budget = `TASKRSRC.target_cost` + `PROJCOST.target_cost`; actual = `act_reg_cost` + `act_ot_cost` + `PROJCOST.act_cost`; remaining = `remain_cost` of both.
* **Units**: when TASKRSRC exists, units come from the assignments (`target_qty`, `act_reg_qty + act_ot_qty`, `remain_qty`); otherwise from TASK work quantities.
* **Risk tables** (PROJRISK / RISKTYPE) are detected but not used - their layout varies by version. Risks come only from an imported register.

## Enumerations

| XER value | Application value |
|---|---|
| TK_NotStart / TK_Active / TK_Complete | Not Started / In Progress / Completed |
| TT_Task, TT_Rsrc, TT_LOE, TT_Mile, TT_FinMile, TT_WBS | Task, Resource Dependent, Level of Effort, Start Milestone, Finish Milestone, WBS Summary |
| CP_Phys / CP_Drtn / CP_Units | Physical / Duration / Units |
| PR_FS / PR_SS / PR_FF / PR_SF | FS / SS / FF / SF |
| CS_MSO, CS_MSOB, CS_MEO, CS_MEOB, CS_MANDSTART, CS_MANDFIN | hard constraints |
| CS_MSOA, CS_MEOA, CS_ALAP | soft constraints |
| CT_TotFloat / CT_DrivPath | critical = Total Float ≤ threshold / Longest Path |

## Field table

| Application key | XER table | XER column | Meaning | Unit | Status | Notes |
|---|---|---|---|---|---|---|
| `project.id` | PROJECT | `proj_id` | Internal project key (foreign key target) |  | VERIFIED |  |
| `project.short_name` | PROJECT | `proj_short_name` | Project ID as shown in P6 |  | VERIFIED |  |
| `project.data_date` | PROJECT | `last_recalc_date` | Project Data Date (date of last schedule calculation) | datetime | VERIFIED | P6 stores the Data Date in last_recalc_date. next_data_date is NOT the data date. |
| `project.plan_start` | PROJECT | `plan_start_date` | Project Planned Start | datetime | VERIFIED |  |
| `project.plan_end` | PROJECT | `plan_end_date` | Project 'Must Finish By' date (may be blank) | datetime | VERIFIED |  |
| `project.scd_end` | PROJECT | `scd_end_date` | Scheduled finish computed by last scheduling run | datetime | VERSION-DEPENDENT |  |
| `project.critical_type` | PROJECT | `critical_path_type` | Critical activity definition: CT_TotFloat or CT_DrivPath (Longest Path) |  | VERSION-DEPENDENT |  |
| `project.critical_float_hours` | PROJECT | `critical_drtn_hr_cnt` | 'Total float less than or equal to' threshold for critical activities | hours | VERSION-DEPENDENT |  |
| `project.default_pct_type` | PROJECT | `def_complete_pct_type` | Default % complete type: CP_Phys / CP_Drtn / CP_Units |  | VERSION-DEPENDENT |  |
| `project.default_calendar` | PROJECT | `clndr_id` | Default project calendar |  | VERSION-DEPENDENT |  |
| `project.baseline_proj_id` | PROJECT | `sum_base_proj_id` | Project baseline (internal key) assigned in P6 |  | VERSION-DEPENDENT | Refers to a baseline stored in the P6 database; not used for matching - the Approved Baseline XER is used instead. |
| `project.export_flag` | PROJECT | `export_flag` | Y when the project was selected for export |  | VERSION-DEPENDENT |  |
| `wbs.id` | PROJWBS | `wbs_id` | Internal WBS key |  | VERIFIED |  |
| `wbs.project_id` | PROJWBS | `proj_id` | Owning project |  | VERIFIED |  |
| `wbs.parent_id` | PROJWBS | `parent_wbs_id` | Parent WBS key |  | VERIFIED |  |
| `wbs.code` | PROJWBS | `wbs_short_name` | WBS code segment |  | VERIFIED |  |
| `wbs.name` | PROJWBS | `wbs_name` | WBS name |  | VERIFIED |  |
| `wbs.seq` | PROJWBS | `seq_num` | Sort order among siblings | int | VERIFIED |  |
| `wbs.project_node` | PROJWBS | `proj_node_flag` | Y for the project root node (its wbs_name is the Project Name) |  | VERIFIED |  |
| `task.id` | TASK | `task_id` | Internal activity key |  | VERIFIED |  |
| `task.project_id` | TASK | `proj_id` | Owning project |  | VERIFIED |  |
| `task.wbs_id` | TASK | `wbs_id` | WBS key |  | VERIFIED |  |
| `task.calendar_id` | TASK | `clndr_id` | Activity calendar |  | VERIFIED |  |
| `task.code` | TASK | `task_code` | Activity ID as shown in P6 |  | VERIFIED |  |
| `task.name` | TASK | `task_name` | Activity Name |  | VERIFIED |  |
| `task.type` | TASK | `task_type` | TT_Task, TT_Rsrc, TT_LOE, TT_Mile (start milestone), TT_FinMile, TT_WBS |  | VERIFIED |  |
| `task.status` | TASK | `status_code` | TK_NotStart, TK_Active, TK_Complete |  | VERIFIED |  |
| `task.pct_type` | TASK | `complete_pct_type` | Activity % complete type: CP_Phys / CP_Drtn / CP_Units |  | VERIFIED |  |
| `task.phys_pct` | TASK | `phys_complete_pct` | Physical % Complete (user entered) | percent 0-100 | VERIFIED |  |
| `task.orig_dur_hours` | TASK | `target_drtn_hr_cnt` | Original Duration | hours | VERIFIED |  |
| `task.rem_dur_hours` | TASK | `remain_drtn_hr_cnt` | Remaining Duration | hours | VERIFIED |  |
| `task.total_float_hours` | TASK | `total_float_hr_cnt` | Total Float (blank for completed activities) | hours | VERIFIED |  |
| `task.free_float_hours` | TASK | `free_float_hr_cnt` | Free Float | hours | VERIFIED |  |
| `task.act_start` | TASK | `act_start_date` | Actual Start | datetime | VERIFIED |  |
| `task.act_end` | TASK | `act_end_date` | Actual Finish | datetime | VERIFIED |  |
| `task.early_start` | TASK | `early_start_date` | Early Start (remaining early start for in-progress work) | datetime | VERIFIED |  |
| `task.early_end` | TASK | `early_end_date` | Early Finish | datetime | VERIFIED |  |
| `task.late_start` | TASK | `late_start_date` | Late Start | datetime | VERIFIED |  |
| `task.late_end` | TASK | `late_end_date` | Late Finish | datetime | VERIFIED |  |
| `task.target_start` | TASK | `target_start_date` | Planned Start (P6 'Planned Start', not the baseline) | datetime | VERIFIED |  |
| `task.target_end` | TASK | `target_end_date` | Planned Finish (P6 'Planned Finish', not the baseline) | datetime | VERIFIED |  |
| `task.restart` | TASK | `restart_date` | Remaining Early Start | datetime | VERSION-DEPENDENT |  |
| `task.reend` | TASK | `reend_date` | Remaining Early Finish | datetime | VERSION-DEPENDENT |  |
| `task.expect_end` | TASK | `expect_end_date` | Expected Finish | datetime | VERSION-DEPENDENT |  |
| `task.cstr_type` | TASK | `cstr_type` | Primary constraint type (CS_MSO, CS_MSOA, CS_MSOB, CS_MEO, CS_MEOA, CS_MEOB, CS_ALAP, CS_MANDSTART, CS_MANDFIN) |  | VERIFIED |  |
| `task.cstr_date` | TASK | `cstr_date` | Primary constraint date | datetime | VERIFIED |  |
| `task.cstr_type2` | TASK | `cstr_type2` | Secondary constraint type |  | VERSION-DEPENDENT |  |
| `task.cstr_date2` | TASK | `cstr_date2` | Secondary constraint date | datetime | VERSION-DEPENDENT |  |
| `task.driving_path` | TASK | `driving_path_flag` | Y when the activity is on the Longest Path of the last schedule run |  | VERSION-DEPENDENT | Present in P6 v8+ exports. When absent, the application computes the longest path itself and labels it as computed. |
| `task.act_work_qty` | TASK | `act_work_qty` | Actual labor units | hours | VERSION-DEPENDENT |  |
| `task.remain_work_qty` | TASK | `remain_work_qty` | Remaining labor units | hours | VERSION-DEPENDENT |  |
| `task.target_work_qty` | TASK | `target_work_qty` | Budgeted labor units | hours | VERSION-DEPENDENT |  |
| `pred.id` | TASKPRED | `task_pred_id` | Relationship key |  | VERIFIED |  |
| `pred.succ_id` | TASKPRED | `task_id` | Successor activity key |  | VERIFIED |  |
| `pred.pred_id` | TASKPRED | `pred_task_id` | Predecessor activity key |  | VERIFIED |  |
| `pred.succ_proj` | TASKPRED | `proj_id` | Successor project |  | VERIFIED |  |
| `pred.pred_proj` | TASKPRED | `pred_proj_id` | Predecessor project |  | VERIFIED |  |
| `pred.type` | TASKPRED | `pred_type` | PR_FS, PR_SS, PR_FF, PR_SF |  | VERIFIED |  |
| `pred.lag_hours` | TASKPRED | `lag_hr_cnt` | Lag (negative = lead) | hours | VERIFIED |  |
| `cal.id` | CALENDAR | `clndr_id` | Calendar key |  | VERIFIED |  |
| `cal.name` | CALENDAR | `clndr_name` | Calendar name |  | VERIFIED |  |
| `cal.project_id` | CALENDAR | `proj_id` | Owning project (project calendars) |  | VERIFIED |  |
| `cal.type` | CALENDAR | `clndr_type` | CA_Base / CA_Project / CA_Rsrc |  | VERIFIED |  |
| `cal.day_hours` | CALENDAR | `day_hr_cnt` | Hours per day used to convert hours to days | hours | VERIFIED |  |
| `cal.data` | CALENDAR | `clndr_data` | Work week and exceptions (nested P6 calendar format) |  | VERIFIED | Days 1..7 = Sunday..Saturday; exception dates are serials from 1899-12-30. |
| `ctype.id` | ACTVTYPE | `actv_code_type_id` | Activity code type key |  | VERIFIED |  |
| `ctype.name` | ACTVTYPE | `actv_code_type` | Activity code type name (e.g. 'Discipline') |  | VERIFIED |  |
| `ctype.scope` | ACTVTYPE | `actv_code_type_scope` | AS_Global / AS_EPS / AS_Project |  | VERSION-DEPENDENT |  |
| `ctype.project_id` | ACTVTYPE | `proj_id` | Owning project for project codes |  | VERSION-DEPENDENT |  |
| `cval.id` | ACTVCODE | `actv_code_id` | Code value key |  | VERIFIED |  |
| `cval.type_id` | ACTVCODE | `actv_code_type_id` | Code type key |  | VERIFIED |  |
| `cval.value` | ACTVCODE | `short_name` | Code value |  | VERIFIED |  |
| `cval.description` | ACTVCODE | `actv_code_name` | Code value description |  | VERIFIED |  |
| `cval.parent_id` | ACTVCODE | `parent_actv_code_id` | Parent value (hierarchical codes) |  | VERIFIED |  |
| `tact.task_id` | TASKACTV | `task_id` | Activity key |  | VERIFIED |  |
| `tact.type_id` | TASKACTV | `actv_code_type_id` | Code type key |  | VERIFIED |  |
| `tact.value_id` | TASKACTV | `actv_code_id` | Code value key |  | VERIFIED |  |
| `udft.id` | UDFTYPE | `udf_type_id` | UDF key |  | VERIFIED |  |
| `udft.table` | UDFTYPE | `table_name` | Table the UDF applies to (TASK, PROJWBS, ...) |  | VERIFIED |  |
| `udft.label` | UDFTYPE | `udf_type_label` | UDF title |  | VERIFIED |  |
| `udft.datatype` | UDFTYPE | `logical_data_type` | FT_TEXT, FT_INT, FT_FLOAT_2_DECIMALS, FT_MONEY, FT_START_DATE, FT_END_DATE, FT_STATICTYPE |  | VERIFIED |  |
| `udfv.type_id` | UDFVALUE | `udf_type_id` | UDF key |  | VERIFIED |  |
| `udfv.fk_id` | UDFVALUE | `fk_id` | Key of the owning row (task_id for TASK UDFs) |  | VERIFIED |  |
| `udfv.text` | UDFVALUE | `udf_text` | Text value |  | VERIFIED |  |
| `udfv.number` | UDFVALUE | `udf_number` | Numeric value |  | VERIFIED |  |
| `udfv.date` | UDFVALUE | `udf_date` | Date value | datetime | VERIFIED |  |
| `rsrc.id` | RSRC | `rsrc_id` | Resource key |  | VERIFIED |  |
| `rsrc.code` | RSRC | `rsrc_short_name` | Resource ID |  | VERIFIED |  |
| `rsrc.name` | RSRC | `rsrc_name` | Resource name |  | VERIFIED |  |
| `rsrc.type` | RSRC | `rsrc_type` | RT_Labor / RT_Equip / RT_Mat |  | VERIFIED |  |
| `trsrc.task_id` | TASKRSRC | `task_id` | Activity key |  | VERIFIED |  |
| `trsrc.rsrc_id` | TASKRSRC | `rsrc_id` | Resource key |  | VERIFIED |  |
| `trsrc.target_qty` | TASKRSRC | `target_qty` | Budgeted units | units | VERIFIED |  |
| `trsrc.act_reg_qty` | TASKRSRC | `act_reg_qty` | Actual regular units | units | VERIFIED |  |
| `trsrc.act_ot_qty` | TASKRSRC | `act_ot_qty` | Actual overtime units | units | VERSION-DEPENDENT |  |
| `trsrc.remain_qty` | TASKRSRC | `remain_qty` | Remaining units | units | VERIFIED |  |
| `trsrc.target_cost` | TASKRSRC | `target_cost` | Budgeted cost | currency | VERIFIED |  |
| `trsrc.act_reg_cost` | TASKRSRC | `act_reg_cost` | Actual regular cost | currency | VERIFIED |  |
| `trsrc.act_ot_cost` | TASKRSRC | `act_ot_cost` | Actual overtime cost | currency | VERSION-DEPENDENT |  |
| `trsrc.remain_cost` | TASKRSRC | `remain_cost` | Remaining cost | currency | VERIFIED |  |
| `pcost.task_id` | PROJCOST | `task_id` | Activity key of expense |  | VERIFIED |  |
| `pcost.name` | PROJCOST | `cost_name` | Expense item |  | VERIFIED |  |
| `pcost.target_cost` | PROJCOST | `target_cost` | Budgeted expense cost | currency | VERIFIED |  |
| `pcost.act_cost` | PROJCOST | `act_cost` | Actual expense cost | currency | VERIFIED |  |
| `pcost.remain_cost` | PROJCOST | `remain_cost` | Remaining expense cost | currency | VERIFIED |  |
| `pcost.vendor` | PROJCOST | `vendor_name` | Vendor |  | VERSION-DEPENDENT |  |
| `pcost.po` | PROJCOST | `po_number` | Purchase order number |  | VERSION-DEPENDENT |  |
