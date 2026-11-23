"""Specification of the TGA / permit activities added to the baseline (revision ZULFI-BL02).
Each activity: code, name, duration (days), calendar id, responsibility, WBS leaf key, predecessors [(code, type, lag_days)], basis, source note.
Naming convention follows the baseline: submission = xx-0nnn, review / approval = xx-2nnn.
Basis: C = contract scope of work, H = SAR Work Permit Handbook V2 (20.01.2026), S = SAR procedure, B = baseline assumption, T = authority time to be confirmed."""

WBS_NEW = [  # key, name  (level 2 node '09' plus leaves)
    ('09', 'TGA Compliance, Safety Assurance and SAR Permits'),
    ('0901', 'ICP and Safety Planning'),
    ('0902', 'Design Safety Assurance (Safe by Design)'),
    ('0903', 'Authority Design Approvals (HCIS, Civil Defense, GAMEP)'),
    ('0904', 'SAR Work Permit and Possession'),
    ('0905', 'Construction Safety Assurance'),
    ('0906', 'Verification, Authority Acceptance and Operational Readiness'),
]

C1, C2 = '1', '2'
ACT = [
 # ---- 09.01 ICP and safety planning
 ('TG-0010', 'Prepare ICP Appointment Package (Scope of Independent Assessment and Competence Evidence)', 7, C1, 'Contractor', '0901', [('PR-0010', 'FS', 0)], 'C', 'Contract clause 18: appointment of an Independent Competent Person'),
 ('TG-0020', 'ICP Appointment - Submission to SAR / TGA', 2, C1, 'Contractor', '0901', [('TG-0010', 'FS', 0)], 'C', 'Contract clause 18'),
 ('TG-2020', 'ICP Appointment - Review and Acceptance by SAR / TGA', 10, C1, 'Authority', '0901', [('TG-0020', 'FS', 0)], 'T', 'TGA time to be confirmed'),
 ('TG-0030', 'Prepare DEMP, Safe-by-Design Safety Plan, RAM Plan and Change Management Procedure', 21, C1, 'Contractor', '0901', [('PR-0010', 'FS', 0)], 'C', 'Clauses 19, 20, 24, 25 and TGA Management and Control of Change'),
 ('TG-0040', 'DEMP, Safety and RAM Plans - Submission to SAR', 2, C1, 'Contractor', '0901', [('TG-0030', 'FS', 0)], 'C', ''),
 ('TG-2040', 'DEMP, Safety and RAM Plans - Review and Approval by SAR', 14, C1, 'SAR', '0901', [('TG-0040', 'FS', 0)], 'B', '14-day review window as the Concept stage'),
 ('TG-0050', 'ICP Review of Safety Plan and Risk Process', 10, C1, 'ICP', '0901', [('TG-2020', 'FS', 0), ('TG-0040', 'FS', 0)], 'B', 'ICP duration proposed'),
 # ---- 09.02 design safety assurance
 ('TG-0110', 'Concept Stage - Safe-by-Design Hazard Identification (All Disciplines)', 21, C1, 'Contractor', '0902', [('TG-0040', 'FS', 0)], 'C', 'Clause 24'),
 ('TG-0120', 'ICP Check of Concept Safety Inputs', 7, C1, 'ICP', '0902', [('TG-0110', 'FS', 0), ('TG-2020', 'FS', 0)], 'B', 'ICP duration proposed'),
 ('TG-0210', 'Preliminary Hazard Analysis, Safety Case and Risk Register', 42, C1, 'Contractor', '0902', [('DS-0020', 'FS', 0)], 'C', 'Clause 35'),
 ('TG-0220', 'Safety Case and Risk Register - Submission to SAR', 2, C1, 'Contractor', '0902', [('TG-0210', 'FS', 0)], 'C', ''),
 ('TG-2220', 'Safety Case and Risk Register - Review by SAR', 21, C1, 'SAR', '0902', [('TG-0220', 'FS', 0)], 'B', '21-day review window as the Preliminary stage'),
 ('TG-0230', 'ICP Review of Preliminary Safety Case', 10, C1, 'ICP', '0902', [('TG-0220', 'FS', 0)], 'B', 'ICP duration proposed'),
 ('TG-0310', 'High-Level EIA Preparation (Preliminary Design)', 35, C1, 'Contractor', '0902', [('DS-0020', 'FS', 0)], 'C', 'Clause 45'),
 ('TG-0320', 'High-Level EIA - Submission to SAR', 2, C1, 'Contractor', '0902', [('TG-0310', 'FS', 0)], 'C', ''),
 ('TG-2320', 'High-Level EIA - Review by SAR (CRS)', 14, C1, 'SAR', '0902', [('TG-0320', 'FS', 0)], 'B', ''),
 ('TG-0330', 'Detailed EIA Preparation (for GAMEP)', 45, C1, 'Contractor', '0902', [('TG-2320', 'FS', 0)], 'C', 'Clause 45'),
 ('TG-0410', 'Hazard Close-out to ALARP and Residual Hazard Transfer List', 21, C1, 'Contractor', '0902', [('DS-0360', 'FS', 0)], 'C', 'Clause 36'),
 ('TG-0420', 'Hazard Close-out Report - Submission to SAR', 2, C1, 'Contractor', '0902', [('TG-0410', 'FS', 0)], 'C', ''),
 ('TG-2420', 'Hazard Close-out Report - Review by SAR', 14, C1, 'SAR', '0902', [('TG-0420', 'FS', 0)], 'B', ''),
 ('TG-0430', 'ICP Design Verification Statement', 10, C1, 'ICP', '0902', [('TG-0420', 'FS', 0)], 'B', 'ICP duration proposed'),
 # ---- 09.03 authority design approvals
 ('TG-0510', 'HCIS Design Package Preparation (HCIS-Approved Consultant)', 21, C1, 'Contractor', '0903', [('DS-0360', 'FS', 0)], 'C', 'Scope of works, building and signalling sections'),
 ('TG-0520', 'HCIS Design Package - Submission to HCIS', 2, C1, 'Contractor', '0903', [('TG-0510', 'FS', 0)], 'C', ''),
 ('TG-2520', 'HCIS Design Approval', 30, C1, 'Authority', '0903', [('TG-0520', 'FS', 0)], 'T', 'HCIS time to be confirmed'),
 ('TG-0530', 'Civil Defense Detailed Design - Submission', 3, C1, 'Contractor', '0903', [('PR-0190', 'FS', 0)], 'C', 'Scope of works: NFPA / SBC and Civil Defense'),
 # ---- 09.04 SAR work permit and possession (SAR Work Permit Handbook V2)
 ('TG-0610', 'Prepare SAR Work Permit Package (Permit Form, WARA, Method Statements, Insurance, KMZ, Staff List, PTS / PO / PICOP Evidence)', 21, C1, 'Contractor', '0904', [('DS-0360', 'FS', 30)], 'H', 'Handbook 4.2: minimum documents'),
 ('TG-0620', 'Work Permit Request - Submission to SAR Permit Department (by SAR as Project Owner)', 2, C1, 'Contractor', '0904', [('TG-0610', 'FS', 0)], 'H', 'Handbook 4.1 and note: request is submitted by the owner, not the contractor'),
 ('TG-2620', 'Work Permit Request - SAR Acceptance Check (5 Working Days)', 5, C1, 'SAR', '0904', [('TG-0620', 'FS', 0)], 'H', 'Handbook 4.1 step 5'),
 ('TG-0630', 'Additional Documents Requested by SAR - Contractor Response (7 Days)', 7, C1, 'Contractor', '0904', [('TG-2620', 'FS', 0)], 'H', 'Handbook 4.1 step 4'),
 ('TG-2630', 'Work Permit - SAR Cross-Functional Technical Review (Engineering, HSE, Insurance, Real Estate, Security, Network Planning)', 30, C1, 'SAR', '0904', [('TG-0630', 'FS', 0)], 'T', 'Handbook section 8; duration assumed so the full permit lead is about 3 months'),
 ('TG-0640', 'Delivery Plan (TTF02) - Submission', 3, C1, 'Contractor', '0904', [('TG-2630', 'FS', 0)], 'H', 'Handbook section 8'),
 ('TG-2640', 'Delivery Plan (TTF02) - SAR Review and Approval', 14, C1, 'SAR', '0904', [('TG-0640', 'FS', 0)], 'T', 'Duration assumed'),
 ('TG-0650', 'Possession Request Package - Loop Line Tie-in (TTF02, WARA, Method Statement, PICOP / PO)', 5, C1, 'Contractor', '0904', 'INSERT:PR-0195', 'H', 'Handbook definitions: possession and TTF02'),
 ('TG-0660', 'Possession Request Package - Turnout Tie-in (TTF02, WARA, Method Statement, PICOP / PO)', 5, C1, 'Contractor', '0904', 'INSERT:PR-0196', 'H', ''),
 # ---- 09.05 construction safety assurance
 ('TG-0710', 'Prepare Construction Safety Plan and ICP Hold / Witness Points', 7, C1, 'Contractor', '0905', [('DS-0360', 'FS', 45)], 'B', 'Prepared in parallel with Detailed design'),
 ('TG-0720', 'Construction Safety Plan - Submission to SAR / ICP', 2, C1, 'Contractor', '0905', [('TG-0710', 'FS', 0)], 'B', ''),
 ('TG-2720', 'Construction Safety Plan - Review and Acceptance by SAR / ICP', 10, C1, 'SAR', '0905', [('TG-0720', 'FS', 0)], 'B', ''),
 ('TG-0730', 'ICP Witness of Critical Works (Level of Effort)', 0, C2, 'ICP', '0905', [('MS-0090', 'SS', 0)], 'B', 'LOE: from construction start to all construction complete'),
 # ---- 09.06 verification and operational readiness
 ('TG-0810', 'ICP Witness of System and Integration Tests and Trial Running', 27, C1, 'ICP', '0906', [('TC-0370', 'SS', 0)], 'B', 'Runs from the start of integration testing to the end of trial running'),
 ('TG-0820', 'ICP Final Verification Report (Prepared During Trial Running)', 6, C1, 'ICP', '0906', [('TC-0460', 'SS', 1)], 'B', 'Report prepared in parallel with trial running so the safety assessment starts the day after trial running ends'),
 ('TG-0830', 'Safety Assessment - Submission (Final Safety Case, ICP Report, Test and Trial Reports)', 5, C1, 'Contractor', '0906', [('TG-0820', 'FS', 0)], 'B', 'Submission completes on the last day of trial running'),
 ('TG-0840', 'Civil Defense Inspection Request - Submission (Main Building Fire and Life Safety)', 3, C1, 'Contractor', '0906', 'INSERT:TC-0020', 'C', ''),
 ('TG-0841', 'Civil Defense Inspection Request - Submission (Ancillary Buildings)', 3, C1, 'Contractor', '0906', 'INSERT:TC-0140', 'C', ''),
 ('TG-0850', 'SEC Inspection Request - Submission', 3, C1, 'Contractor', '0906', 'INSERT:TC-0110', 'C', ''),
 ('TG-0860', 'NWC Inspection Request - Submission', 3, C1, 'Contractor', '0906', 'INSERT:TC-0210', 'C', ''),
 ('TG-0870', 'Authority Inspection Request - Submission (NWC / SEC / Telecom Permanent Connections)', 3, C1, 'Contractor', '0906', 'INSERT:TC-0230', 'C', ''),
 ('TG-0880', 'Taking-Over Certificate Application and Document Submission (As-Builts, O&M Manuals, Spares, Assurance Letter, Authority Certificates)', 5, C1, 'Contractor', '0906', [('TC-0380', 'SS', 10), ('TC-0410', 'FS', 0)], 'C', 'Clause 22: red-lines, as-builts, O&M manuals and spare parts list; submitted in the last 5 days of the SAR safety assessment'),
 ('TG-0910', 'Operating Rules Change Request and Risk Assessment - Loop Line and Turnouts', 10, C1, 'SAR', '0906', [('MS-0090', 'FS', 0)], 'S', 'SAR-012-200-02-001'),
 ('TG-0920', 'Operating Rules Critical Change Request Form - Submission (SAR-012-200-4-001)', 2, C1, 'SAR', '0906', [('TG-0910', 'FS', 0)], 'S', ''),
 ('TG-2920', 'Change Request Review by Railway Excellence and Governance (15 Days)', 15, C1, 'SAR', '0906', [('TG-0920', 'FS', 0)], 'S', 'SLA 15 days'),
 ('TG-2925', 'Railway Governance Notice (RGN) Preparation and Publication (15 Days)', 15, C1, 'SAR', '0906', [('TG-2920', 'FS', 0)], 'S', 'SLA 15 days'),
 ('TG-0930', 'SAR Operational Readiness Review (Staff, Procedures, Operating Rules)', 7, C1, 'SAR', '0906', [('TC-0380', 'SS', 3)], 'B', ''),
]

# Extra relationships added to EXISTING activities (pred_code -> succ_code)
LINKS = [
 ('TG-0050', 'DS-0020', 'FS', 0), ('TG-2040', 'DS-0020', 'FS', 0), ('TG-0120', 'DS-0020', 'FS', 0),
 ('TG-2220', 'DS-0360', 'FS', 0), ('TG-0230', 'DS-0360', 'FS', 0), ('TG-2320', 'DS-0360', 'FS', 0),
 ('TG-2420', 'DS-0700', 'FS', 0), ('TG-0430', 'DS-0700', 'FS', 0), ('TG-2520', 'DS-0700', 'FS', 0),
 ('TG-0330', 'PR-0270', 'FS', 0),
 ('TG-0530', 'PR-0110', 'FS', 0),
 ('TG-2520', 'MS-0075', 'FS', 0),
 ('TG-2640', 'PR-0120', 'FS', 0),
 ('TG-2720', 'MS-0090', 'FS', 0),
 ('TG-0730', 'MS-0120', 'FF', 0),
 ('TG-0810', 'TC-0460', 'FF', 0),
 ('TG-2925', 'TC-0460', 'FS', 0),
 ('TG-0830', 'TC-0380', 'FS', 0),
 ('TG-0880', 'CO-0015', 'FS', 0),
 ('TG-0930', 'CO-0015', 'FS', 0),
]
# Renames of existing activities (clearer submit / review separation)
RENAME = {
 'PR-0110': 'Civil Defense Design Review and Approval (Concept and Detailed)',
 'PR-0190': 'Civil Defense Concept Design - Submission',
 'PR-0120': 'SAR Work Permit - Final Approval and Issue (14 Days after Detailed Design Approval)',
 'PR-0195': 'SAR Operations Possession Booking - Track Tie-in (Loop Line)',
 'PR-0196': 'SAR Operations Possession Booking - Turnout Tie-in',
 'TC-0380': 'SAR Safety Assessment and Acceptance - Review',
 'CO-0015': 'SAR Taking-Over Certificate - Review and Issue',
 'TC-0020': 'Civil Defense and Authority Inspections - Main Building',
 'TC-0140': 'Civil Defense Inspection and Approval - Ancillary Buildings',
 'TC-0110': 'SEC Inspection and Permanent Connection',
 'TC-0210': 'NWC Inspection and Acceptance',
}
# Demobilisation overlaps the SAR Taking-Over review (logic change, no duration change)
LOGIC_CHANGES = []
