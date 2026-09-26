from datetime import date, datetime

import pytest

from sar_pcd.core.dates import parse_p6_date
from sar_pcd.core.loader import ScheduleLoadError, list_projects, load_schedule, parse_calendar_data
from sar_pcd.core.model import Calendar
from sar_pcd.core.xer_parser import XerParseError, parse_xer

MINI = (
    "ERMHDR\t19.12\t2025-05-01\tProject\tadmin\n"
    "%T\tPROJECT\n%F\tproj_id\tproj_short_name\tlast_recalc_date\n"
    "%R\t1\tP1\t2025-04-30 08:00\n"
    "%R\t2\tP2\t2025-04-30 08:00\n"
    "%T\tPROJWBS\n%F\twbs_id\tproj_id\tproj_node_flag\twbs_short_name\twbs_name\tparent_wbs_id\n"
    "%R\t10\t1\tY\tP1\tMetro Line Café\t\n"
    "%R\t11\t1\tN\tENG\tEngineering\t10\n"
    "%R\t20\t2\tY\tP2\tSecond\t\n"
    "%T\tTASK\n%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\tstatus_code\ttask_type\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\n"
    "%R\t100\t1\t11\tA100\tDesign\tTK_Active\tTT_Task\t80\t40\n"
    "%R\t101\t1\t11\tA110\tShort row\n"
    "%R\t200\t2\t20\tB100\tOther\tTK_NotStart\tTT_Task\t8\t8\n"
    "%E\n"
)


def test_parse_basic_and_cp1252():
    x = parse_xer(MINI.encode("cp1252"), "mini.xer")
    assert x.version == "19.12"
    assert x.encoding == "cp1252"
    assert len(x.table("TASK")) == 3
    t = x.table("TASK")
    assert t.get(t.rows[1], "status_code") == ""  # short row padded
    projects = list_projects(x)
    assert [p.short_name for p in projects] == ["P1", "P2"]
    assert projects[0].name == "Metro Line Café"
    assert projects[0].activity_count == 2


def test_utf8_and_bom():
    x = parse_xer(b"\xef\xbb\xbf" + MINI.encode("utf-8"), "u.xer")
    assert x.encoding == "utf-8-sig"
    assert list_projects(x)[0].name == "Metro Line Café"


def test_multi_project_requires_selection():
    x = parse_xer(MINI.encode("cp1252"))
    with pytest.raises(ScheduleLoadError):
        load_schedule(x)
    s = load_schedule(x, "2")
    assert list(a.code for a in s.activities.values()) == ["B100"]


def test_missing_optional_tables_do_not_crash():
    s = load_schedule(parse_xer(MINI.encode("cp1252")), "1")
    assert s.project.data_date == datetime(2025, 4, 30, 8, 0)
    assert s.availability["budget_cost"] is False
    assert any("Cost data was not found" in w for w in s.warnings)
    a = s.by_code("A100")
    assert a.status == "In Progress"
    assert a.duration_pct == 50.0


def test_rejects_non_xer():
    with pytest.raises(XerParseError):
        parse_xer(b"hello world\nthis is not an xer")
    with pytest.raises(XerParseError):
        parse_xer(b"   ")


@pytest.mark.parametrize("text,expected", [
    ("2025-04-30 08:00", datetime(2025, 4, 30, 8, 0)),
    ("2025-04-30 08:00:00", datetime(2025, 4, 30, 8, 0)),
    ("2025-04-30", datetime(2025, 4, 30)),
    ("30-Apr-25 08:00", datetime(2025, 4, 30, 8, 0)),
])
def test_date_formats(text, expected):
    assert parse_p6_date(text) == expected


def test_date_blank_and_invalid():
    assert parse_p6_date("") is None
    with pytest.raises(ValueError):
        parse_p6_date("not a date")


def test_calendar_data_sun_thu_with_exception():
    data = ("(0||CalendarData()((0||DaysOfWeek()((0||1()((0||0(s|08:00|f|16:00)())))(0||2()((0||0(s|08:00|f|16:00)())))"
            "(0||3()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||4()((0||0(s|08:00|f|16:00)())))"
            "(0||5()((0||0(s|08:00|f|16:00)())))(0||6()())(0||7()())))(0||VIEW(ShowTotal|Y)())"
            "(0||Exceptions()((0||0(d|45747)())(0||1(d|45752)((0||0(s|08:00|f|16:00)())))))))")
    cal = Calendar("1", "SunThu")
    parse_calendar_data(cal, data.replace(")(", ")\x7f("))
    assert cal.parsed_ok
    # Mon..Thu working, Fri/Sat off, Sun working
    assert cal.workdays == [True, True, True, True, False, False, True]
    assert date(2025, 3, 31) in cal.holidays          # serial 45747
    assert date(2025, 4, 5) in cal.extra_workdays     # serial 45752 (a Saturday) worked
    assert cal.workdays_between(date(2025, 3, 30), date(2025, 4, 6)) == 5  # Sun..Sat, minus holiday, plus Sat


def test_unparseable_calendar_falls_back():
    cal = Calendar("1", "Broken")
    parse_calendar_data(cal, "garbage")
    assert not cal.parsed_ok
    assert cal.workdays == [True, True, True, True, True, False, False]
