"""Centralized Primavera P6 XER -> application field mapping layer.

Every XER column the application reads is declared here, together with its
documented meaning, unit and a verification status. The loader never reads a
raw column name directly; it asks this module. Supporting a new P6/XER version
therefore means editing this table (e.g. adding an alternate column name), not
the analytics engine.

Verification status:
    VERIFIED    - meaning confirmed against the P6 EPPM/Professional data
                  dictionary for the TASK/PROJECT/... tables (P6 v8.x - v23).
    VERSION     - column exists only in some P6 versions / export settings;
                  the application checks for its presence and degrades.
    UNVERIFIED  - meaning believed correct but not confirmed for every P6
                  version; results depending on it are flagged in the UI.
"""
from __future__ import annotations

from dataclasses import dataclass

VERIFIED = "VERIFIED"
VERSION = "VERSION-DEPENDENT"
UNVERIFIED = "UNVERIFIED"


@dataclass(frozen=True)
class FieldSpec:
    table: str
    field: str
    meaning: str
    unit: str = ""
    status: str = VERIFIED
    alternates: tuple[str, ...] = ()
    note: str = ""


F = FieldSpec

FIELD_MAP: dict[str, FieldSpec] = {
    # ---------------------------------------------------------------- PROJECT
    "project.id": F("PROJECT", "proj_id", "Internal project key (foreign key target)"),
    "project.short_name": F("PROJECT", "proj_short_name", "Project ID as shown in P6"),
    "project.data_date": F("PROJECT", "last_recalc_date", "Project Data Date (date of last schedule calculation)", "datetime",
                           note="P6 stores the Data Date in last_recalc_date. next_data_date is NOT the data date."),
    "project.plan_start": F("PROJECT", "plan_start_date", "Project Planned Start", "datetime"),
    "project.plan_end": F("PROJECT", "plan_end_date", "Project 'Must Finish By' date (may be blank)", "datetime"),
    "project.scd_end": F("PROJECT", "scd_end_date", "Scheduled finish computed by last scheduling run", "datetime", VERSION),
    "project.critical_type": F("PROJECT", "critical_path_type", "Critical activity definition: CT_TotFloat or CT_DrivPath (Longest Path)", status=VERSION),
    "project.critical_float_hours": F("PROJECT", "critical_drtn_hr_cnt", "'Total float less than or equal to' threshold for critical activities", "hours", VERSION),
    "project.default_pct_type": F("PROJECT", "def_complete_pct_type", "Default % complete type: CP_Phys / CP_Drtn / CP_Units", status=VERSION),
    "project.default_calendar": F("PROJECT", "clndr_id", "Default project calendar", status=VERSION),
    "project.baseline_proj_id": F("PROJECT", "sum_base_proj_id", "Project baseline (internal key) assigned in P6", status=VERSION,
                                  note="Refers to a baseline stored in the P6 database; not used for matching - the Approved Baseline XER is used instead."),
    "project.export_flag": F("PROJECT", "export_flag", "Y when the project was selected for export", status=VERSION),
    # ---------------------------------------------------------------- PROJWBS
    "wbs.id": F("PROJWBS", "wbs_id", "Internal WBS key"),
    "wbs.project_id": F("PROJWBS", "proj_id", "Owning project"),
    "wbs.parent_id": F("PROJWBS", "parent_wbs_id", "Parent WBS key"),
    "wbs.code": F("PROJWBS", "wbs_short_name", "WBS code segment"),
    "wbs.name": F("PROJWBS", "wbs_name", "WBS name"),
    "wbs.seq": F("PROJWBS", "seq_num", "Sort order among siblings", "int"),
    "wbs.project_node": F("PROJWBS", "proj_node_flag", "Y for the project root node (its wbs_name is the Project Name)"),
    # ---------------------------------------------------------------- TASK
    "task.id": F("TASK", "task_id", "Internal activity key"),
    "task.project_id": F("TASK", "proj_id", "Owning project"),
    "task.wbs_id": F("TASK", "wbs_id", "WBS key"),
    "task.calendar_id": F("TASK", "clndr_id", "Activity calendar"),
    "task.code": F("TASK", "task_code", "Activity ID as shown in P6"),
    "task.name": F("TASK", "task_name", "Activity Name"),
    "task.type": F("TASK", "task_type", "TT_Task, TT_Rsrc, TT_LOE, TT_Mile (start milestone), TT_FinMile, TT_WBS"),
    "task.status": F("TASK", "status_code", "TK_NotStart, TK_Active, TK_Complete"),
    "task.pct_type": F("TASK", "complete_pct_type", "Activity % complete type: CP_Phys / CP_Drtn / CP_Units"),
    "task.phys_pct": F("TASK", "phys_complete_pct", "Physical % Complete (user entered)", "percent 0-100"),
    "task.orig_dur_hours": F("TASK", "target_drtn_hr_cnt", "Original Duration", "hours"),
    "task.rem_dur_hours": F("TASK", "remain_drtn_hr_cnt", "Remaining Duration", "hours"),
    "task.total_float_hours": F("TASK", "total_float_hr_cnt", "Total Float (blank for completed activities)", "hours"),
    "task.free_float_hours": F("TASK", "free_float_hr_cnt", "Free Float", "hours"),
    "task.act_start": F("TASK", "act_start_date", "Actual Start", "datetime"),
    "task.act_end": F("TASK", "act_end_date", "Actual Finish", "datetime"),
    "task.early_start": F("TASK", "early_start_date", "Early Start (remaining early start for in-progress work)", "datetime"),
    "task.early_end": F("TASK", "early_end_date", "Early Finish", "datetime"),
    "task.late_start": F("TASK", "late_start_date", "Late Start", "datetime"),
    "task.late_end": F("TASK", "late_end_date", "Late Finish", "datetime"),
    "task.target_start": F("TASK", "target_start_date", "Planned Start (P6 'Planned Start', not the baseline)", "datetime"),
    "task.target_end": F("TASK", "target_end_date", "Planned Finish (P6 'Planned Finish', not the baseline)", "datetime"),
    "task.restart": F("TASK", "restart_date", "Remaining Early Start", "datetime", VERSION),
    "task.reend": F("TASK", "reend_date", "Remaining Early Finish", "datetime", VERSION),
    "task.expect_end": F("TASK", "expect_end_date", "Expected Finish", "datetime", VERSION),
    "task.cstr_type": F("TASK", "cstr_type", "Primary constraint type (CS_MSO, CS_MSOA, CS_MSOB, CS_MEO, CS_MEOA, CS_MEOB, CS_ALAP, CS_MANDSTART, CS_MANDFIN)"),
    "task.cstr_date": F("TASK", "cstr_date", "Primary constraint date", "datetime"),
    "task.cstr_type2": F("TASK", "cstr_type2", "Secondary constraint type", status=VERSION),
    "task.cstr_date2": F("TASK", "cstr_date2", "Secondary constraint date", "datetime", VERSION),
    "task.driving_path": F("TASK", "driving_path_flag", "Y when the activity is on the Longest Path of the last schedule run", status=VERSION,
                           note="Present in P6 v8+ exports. When absent, the application computes the longest path itself and labels it as computed."),
    "task.act_work_qty": F("TASK", "act_work_qty", "Actual labor units", "hours", VERSION),
    "task.remain_work_qty": F("TASK", "remain_work_qty", "Remaining labor units", "hours", VERSION),
    "task.target_work_qty": F("TASK", "target_work_qty", "Budgeted labor units", "hours", VERSION),
    # ---------------------------------------------------------------- TASKPRED
    "pred.id": F("TASKPRED", "task_pred_id", "Relationship key"),
    "pred.succ_id": F("TASKPRED", "task_id", "Successor activity key"),
    "pred.pred_id": F("TASKPRED", "pred_task_id", "Predecessor activity key"),
    "pred.succ_proj": F("TASKPRED", "proj_id", "Successor project"),
    "pred.pred_proj": F("TASKPRED", "pred_proj_id", "Predecessor project"),
    "pred.type": F("TASKPRED", "pred_type", "PR_FS, PR_SS, PR_FF, PR_SF"),
    "pred.lag_hours": F("TASKPRED", "lag_hr_cnt", "Lag (negative = lead)", "hours"),
    # ---------------------------------------------------------------- CALENDAR
    "cal.id": F("CALENDAR", "clndr_id", "Calendar key"),
    "cal.name": F("CALENDAR", "clndr_name", "Calendar name"),
    "cal.project_id": F("CALENDAR", "proj_id", "Owning project (project calendars)"),
    "cal.type": F("CALENDAR", "clndr_type", "CA_Base / CA_Project / CA_Rsrc"),
    "cal.day_hours": F("CALENDAR", "day_hr_cnt", "Hours per day used to convert hours to days", "hours"),
    "cal.data": F("CALENDAR", "clndr_data", "Work week and exceptions (nested P6 calendar format)",
                  note="Days 1..7 = Sunday..Saturday; exception dates are serials from 1899-12-30."),
    # ---------------------------------------------------------------- CODES
    "ctype.id": F("ACTVTYPE", "actv_code_type_id", "Activity code type key"),
    "ctype.name": F("ACTVTYPE", "actv_code_type", "Activity code type name (e.g. 'Discipline')"),
    "ctype.scope": F("ACTVTYPE", "actv_code_type_scope", "AS_Global / AS_EPS / AS_Project", status=VERSION),
    "ctype.project_id": F("ACTVTYPE", "proj_id", "Owning project for project codes", status=VERSION),
    "cval.id": F("ACTVCODE", "actv_code_id", "Code value key"),
    "cval.type_id": F("ACTVCODE", "actv_code_type_id", "Code type key"),
    "cval.value": F("ACTVCODE", "short_name", "Code value"),
    "cval.description": F("ACTVCODE", "actv_code_name", "Code value description"),
    "cval.parent_id": F("ACTVCODE", "parent_actv_code_id", "Parent value (hierarchical codes)"),
    "tact.task_id": F("TASKACTV", "task_id", "Activity key"),
    "tact.type_id": F("TASKACTV", "actv_code_type_id", "Code type key"),
    "tact.value_id": F("TASKACTV", "actv_code_id", "Code value key"),
    # ---------------------------------------------------------------- UDF
    "udft.id": F("UDFTYPE", "udf_type_id", "UDF key"),
    "udft.table": F("UDFTYPE", "table_name", "Table the UDF applies to (TASK, PROJWBS, ...)"),
    "udft.label": F("UDFTYPE", "udf_type_label", "UDF title"),
    "udft.datatype": F("UDFTYPE", "logical_data_type", "FT_TEXT, FT_INT, FT_FLOAT_2_DECIMALS, FT_MONEY, FT_START_DATE, FT_END_DATE, FT_STATICTYPE"),
    "udfv.type_id": F("UDFVALUE", "udf_type_id", "UDF key"),
    "udfv.fk_id": F("UDFVALUE", "fk_id", "Key of the owning row (task_id for TASK UDFs)"),
    "udfv.text": F("UDFVALUE", "udf_text", "Text value"),
    "udfv.number": F("UDFVALUE", "udf_number", "Numeric value"),
    "udfv.date": F("UDFVALUE", "udf_date", "Date value", "datetime"),
    # ---------------------------------------------------------------- RESOURCES
    "rsrc.id": F("RSRC", "rsrc_id", "Resource key"),
    "rsrc.code": F("RSRC", "rsrc_short_name", "Resource ID"),
    "rsrc.name": F("RSRC", "rsrc_name", "Resource name"),
    "rsrc.type": F("RSRC", "rsrc_type", "RT_Labor / RT_Equip / RT_Mat"),
    "trsrc.task_id": F("TASKRSRC", "task_id", "Activity key"),
    "trsrc.rsrc_id": F("TASKRSRC", "rsrc_id", "Resource key"),
    "trsrc.target_qty": F("TASKRSRC", "target_qty", "Budgeted units", "units"),
    "trsrc.act_reg_qty": F("TASKRSRC", "act_reg_qty", "Actual regular units", "units"),
    "trsrc.act_ot_qty": F("TASKRSRC", "act_ot_qty", "Actual overtime units", "units", VERSION),
    "trsrc.remain_qty": F("TASKRSRC", "remain_qty", "Remaining units", "units"),
    "trsrc.target_cost": F("TASKRSRC", "target_cost", "Budgeted cost", "currency"),
    "trsrc.act_reg_cost": F("TASKRSRC", "act_reg_cost", "Actual regular cost", "currency"),
    "trsrc.act_ot_cost": F("TASKRSRC", "act_ot_cost", "Actual overtime cost", "currency", VERSION),
    "trsrc.remain_cost": F("TASKRSRC", "remain_cost", "Remaining cost", "currency"),
    # ---------------------------------------------------------------- EXPENSES
    "pcost.task_id": F("PROJCOST", "task_id", "Activity key of expense"),
    "pcost.name": F("PROJCOST", "cost_name", "Expense item"),
    "pcost.target_cost": F("PROJCOST", "target_cost", "Budgeted expense cost", "currency"),
    "pcost.act_cost": F("PROJCOST", "act_cost", "Actual expense cost", "currency"),
    "pcost.remain_cost": F("PROJCOST", "remain_cost", "Remaining expense cost", "currency"),
    "pcost.vendor": F("PROJCOST", "vendor_name", "Vendor", status=VERSION),
    "pcost.po": F("PROJCOST", "po_number", "Purchase order number", status=VERSION),
}

# Enumerations used by P6 (normalized to application values)
TASK_STATUS = {"TK_NotStart": "Not Started", "TK_Active": "In Progress", "TK_Complete": "Completed"}
TASK_TYPE = {
    "TT_Task": "Task Dependent", "TT_Rsrc": "Resource Dependent", "TT_LOE": "Level of Effort",
    "TT_Mile": "Start Milestone", "TT_FinMile": "Finish Milestone", "TT_WBS": "WBS Summary",
}
PCT_TYPE = {"CP_Phys": "Physical", "CP_Drtn": "Duration", "CP_Units": "Units"}
REL_TYPE = {"PR_FS": "FS", "PR_SS": "SS", "PR_FF": "FF", "PR_SF": "SF"}
CONSTRAINTS = {
    "CS_MSO": ("Start On", "hard"),
    "CS_MSOB": ("Start On or Before", "hard"),
    "CS_MSOA": ("Start On or After", "soft"),
    "CS_MEO": ("Finish On", "hard"),
    "CS_MEOB": ("Finish On or Before", "hard"),
    "CS_MEOA": ("Finish On or After", "soft"),
    "CS_ALAP": ("As Late As Possible", "soft"),
    "CS_MANDSTART": ("Mandatory Start", "hard"),
    "CS_MANDFIN": ("Mandatory Finish", "hard"),
}


def spec(key: str) -> FieldSpec:
    return FIELD_MAP[key]


def columns_for(key: str) -> tuple[str, ...]:
    s = FIELD_MAP[key]
    return (s.field,) + s.alternates


def render_markdown() -> str:
    """Render the mapping as Markdown (used to produce docs/XER_FIELD_MAPPING.md)."""
    out = [
        "| Application key | XER table | XER column | Meaning | Unit | Status | Notes |",
        "|---|---|---|---|---|---|---|",
    ]
    for key, s in FIELD_MAP.items():
        col = s.field + (" / " + " / ".join(s.alternates) if s.alternates else "")
        out.append(f"| `{key}` | {s.table} | `{col}` | {s.meaning} | {s.unit} | {s.status} | {s.note} |")
    return "\n".join(out)
