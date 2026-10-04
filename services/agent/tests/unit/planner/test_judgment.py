from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.planner import judgment, schedule, shape

TZ = "America/Detroit"
Z = ZoneInfo(TZ)
MON = date(2026, 10, 5)  # ordinal % 3 == 2


def at(h, m=0, day=MON):
    return datetime.combine(day, time(h, m), tzinfo=Z)


def ev(day, h1, h2, title):
    start, end = at(h1, day=day), at(h2, day=day)
    return {"title": title, "starts_at": start.astimezone(UTC), "ends_at": end.astimezone(UTC)}


def plan(day, picks, busy=(), events=(), flags=(), load=None, bed=(23, 0)):
    start, end = shape.waking_window(day, TZ, time(7), time(*bed))
    free = shape.free_windows(list(busy), start, end)
    free_min = sum(s.minutes for s in free)
    load = load or shape.classify(shape.busy_minutes(list(busy), start, end), len(busy), free_min)
    ctx = judgment.Context(
        day=day,
        exams=judgment.parse_exams(list(events), day, Z),
        courses=judgment.find_courses(list(events)),
        bed=at(*bed, day=day),
    )
    keys = schedule.planned_keys(picks, set(flags), day, load, ctx)
    return schedule.place(keys, free, load, ctx)


def test_study_is_never_scheduled_late_at_night_even_if_that_is_all_that_is_free():
    late = [shape.Slot(at(21, 30), at(23, 30))]
    assert schedule.place(["study"], late, "normal") == []


def test_study_takes_the_good_hours_and_leaves_lunch_and_dinner_alone():
    items = [i for i in plan(MON, ["study"]) if i.key == "study"]
    assert items
    for i in items:
        assert 9 <= i.start.hour < 17 or 19 <= i.start.hour < 21
        assert not (12 <= i.start.hour + i.start.minute / 60 < 13.25)


def test_study_blocks_are_not_squeezed_into_a_gap_when_a_roomier_one_exists():
    slots = [shape.Slot(at(9), at(9, 50)), shape.Slot(at(14), at(17))]
    (item,) = schedule.place(["study"], slots, "packed")
    assert item.start.hour == 9 or item.start.hour >= 14
    assert any(s.start <= item.start and item.end <= s.end for s in slots)


def test_an_exam_on_the_calendar_steers_the_study_blocks_and_adds_time():
    exam = [ev(date(2026, 10, 8), 10, 12, "EECS 281 Midterm")]
    items = [i for i in plan(MON, ["study"], events=exam, load="normal") if i.key == "study"]
    assert items[0].title == "Deep study: EECS 281"
    assert "Midterm is in 3 days" in items[0].why or "EECS 281 Midterm is in 3 days" in items[0].why
    close = [ev(date(2026, 10, 6), 10, 12, "EECS 281 Midterm")]
    assert len([i for i in plan(MON, ["study"], events=close, load="normal") if i.key == "study"]) == 3


def test_without_an_exam_the_courses_on_the_calendar_are_rotated():
    events = [ev(MON, 9, 10, "MATH 215 Lecture"), ev(MON, 13, 14, "EECS 281 Lecture")]
    titles = {i.title for i in plan(MON, ["study"], events=events, load="light") if i.key == "study"}
    assert any("MATH 215" in t for t in titles) and any("EECS 281" in t for t in titles)


def test_exams_are_found_by_word_and_a_final_project_is_not_an_exam():
    events = [
        ev(date(2026, 10, 7), 9, 10, "Chemistry quiz"),
        ev(date(2026, 10, 9), 9, 10, "BIO 101 Final Exam (Room 12)"),
        ev(date(2026, 10, 9), 9, 10, "Final project due"),
        ev(date(2026, 10, 9), 9, 10, "Contest night"),
        ev(date(2026, 12, 1), 9, 10, "Physics exam"),
    ]
    found = judgment.parse_exams(events, MON, Z)
    assert [(e.subject, e.days_away) for e in found] == [("Chemistry", 2), ("BIO 101", 4)]


def test_a_workout_is_thrown_in_now_and_then_when_studying_is_the_focus():
    days = [date(2026, 10, 5) + timedelta(days=n) for n in range(6)]
    with_move = [d for d in days if any(i.key == "move" for i in plan(d, ["study"], load="light"))]
    assert 1 <= len(with_move) <= 3  # occasionally, not every day
    for d in with_move:
        assert d.toordinal() % 3 == 0


def test_no_extra_workout_when_exercise_is_already_a_focus_on_a_packed_day_or_exam_day():
    d = next(x for x in (date(2026, 10, 5) + timedelta(days=n) for n in range(6)) if x.toordinal() % 3 == 0)
    assert not any(i.key == "move" for i in plan(d, ["study", "workouts"], load="light"))
    assert not any(i.key == "move" for i in plan(d, ["study"], load="packed"))
    today_exam = [ev(d, 10, 12, "CHEM 130 Exam")]
    assert not any(i.key == "move" for i in plan(d, ["study"], events=today_exam, load="light"))


def test_a_break_between_study_blocks_when_there_is_no_workout():
    d = next(x for x in (date(2026, 10, 5) + timedelta(days=n) for n in range(6)) if x.toordinal() % 3 != 0)
    items = plan(d, ["study"], load="light")
    assert any(i.key == "break" for i in items) and not any(i.key == "move" for i in items)


def test_exercise_is_not_placed_right_before_bed():
    evening_only = [shape.Slot(at(20), at(22))]
    ctx = judgment.Context(day=MON, bed=at(22, 30))
    assert schedule.place(["workouts"], evening_only, "normal", ctx) == []


def test_titles_vary_from_day_to_day_so_the_calendar_is_not_stale():
    seen = set()
    for n in range(3):
        d = MON + timedelta(days=n)
        seen |= {i.title for i in plan(d, ["study"], load="light") if i.key == "study"}
    assert len(seen) > 3
