from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.planner import schedule, shape

TZ = "America/Detroit"
Z = ZoneInfo(TZ)
MON = date(2026, 10, 5)


def at(h: int, m: int = 0, day: date = MON) -> datetime:
    return datetime.combine(day, time(h, m), tzinfo=Z)


def ev(start: datetime, end: datetime, title: str = "Meeting", important: bool = False) -> dict:
    return {
        "title": title,
        "starts_at": start.astimezone(UTC),
        "ends_at": end.astimezone(UTC),
        "is_important": important,
    }


# ---------------------------------------------------------------- shape


def test_all_day_events_are_whole_utc_days_and_do_not_block_time():
    midnight = datetime(2026, 10, 5, tzinfo=UTC)
    assert shape.is_all_day(midnight, midnight + timedelta(days=1))
    assert shape.is_all_day(midnight, midnight + timedelta(days=3))
    assert not shape.is_all_day(datetime(2026, 10, 5, 14, tzinfo=UTC), datetime(2026, 10, 5, 15, tzinfo=UTC))
    assert not shape.is_all_day(datetime(2026, 10, 5, 4, tzinfo=UTC), datetime(2026, 10, 6, 4, tzinfo=UTC))
    busy = shape.timed_busy(
        [
            ev(at(10), at(11)),
            {**ev(at(0), at(1)), "starts_at": midnight, "ends_at": midnight + timedelta(days=1)},
        ],
        TZ,
    )
    assert busy == [(at(10), at(11))]


def test_merge_joins_overlapping_and_touching_meetings():
    merged = shape.merge([(at(10), at(11)), (at(10, 30), at(12)), (at(12), at(13)), (at(15), at(16))])
    assert merged == [(at(10), at(13)), (at(15), at(16))]


def test_waking_window_runs_an_hour_after_waking_until_90_minutes_before_bed():
    assert shape.waking_window(MON, TZ, time(7), time(22, 30)) == (at(8), at(21))
    start, end = shape.waking_window(MON, TZ, time(7), time(0, 30))  # bed after midnight
    assert (start, end) == (at(8), at(23))


def test_free_windows_keep_clear_of_meetings_and_drop_gaps_that_are_too_short():
    busy = [(at(10), at(11)), (at(11, 30), at(12, 30)), (at(15), at(16))]
    slots = shape.free_windows(busy, at(8), at(21))
    assert [(s.start, s.end) for s in slots] == [
        (at(8), at(9, 50)),
        (at(12, 40), at(14, 50)),
        (at(16, 10), at(21)),
    ]  # the 30 minute gap between the first two meetings is too short after the 10 minute buffers


def test_a_day_with_no_meetings_is_one_free_window():
    assert [(s.start, s.end) for s in shape.free_windows([], at(8), at(21))] == [(at(8), at(21))]


def test_busy_minutes_are_clipped_to_the_window_and_not_double_counted():
    busy = [(at(7), at(9)), (at(8, 30), at(10)), (at(20), at(23))]
    assert shape.busy_minutes(busy, at(8), at(21)) == 120 + 60


@pytest.mark.parametrize(
    ("busy", "events", "free", "expected"),
    [
        (60, 1, 600, "light"),
        (240, 4, 400, "normal"),
        (400, 5, 200, "packed"),
        (200, 6, 300, "packed"),
        (200, 3, 80, "packed"),
        (119, 2, 500, "light"),
        (120, 2, 500, "normal"),
    ],
)
def test_classify(busy, events, free, expected):
    assert shape.classify(busy, events, free) == expected


# ---------------------------------------------------------------- scheduling

SLOTS = [shape.Slot(at(8), at(9, 50)), shape.Slot(at(12, 40), at(14, 50)), shape.Slot(at(16, 10), at(21))]


def by_key(items):
    out = {}
    for i in items:
        out.setdefault(i.key, []).append(i)
    return out


def test_each_focus_lands_in_its_preferred_part_of_the_day():
    items = by_key(schedule.place(["steps", "workouts", "study"], SLOTS, "normal"))
    assert (items["steps"][0].start, items["steps"][0].end) == (at(12, 40), at(13, 0))
    assert (items["workouts"][0].start, items["workouts"][0].end) == (at(16, 10), at(16, 40))
    assert [(s.start, s.end) for s in items["study"]] == [(at(9), at(9, 45)), (at(14), at(14, 45))]


def test_items_never_overlap_and_keep_a_gap():
    items = schedule.place(["steps", "heart", "balance", "stress", "workouts", "study"], SLOTS, "light")
    for a, b in zip(items, items[1:], strict=False):
        assert b.start - a.end >= timedelta(minutes=schedule.GAP_MIN)
    for i in items:
        assert any(s.start <= i.start and i.end <= s.end for s in SLOTS)


def test_the_first_pick_gets_first_choice_of_time():
    first = by_key(schedule.place(["steps", "heart"], SLOTS, "normal"))
    assert first["steps"][0].start == at(12, 40)
    assert first["heart"][0].start > first["steps"][0].end
    swapped = by_key(schedule.place(["heart", "steps"], SLOTS, "normal"))
    assert swapped["heart"][0].start == at(12, 40)


def test_busy_days_get_shorter_and_fewer_blocks():
    light = schedule.place(["study", "steps"], SLOTS, "light")
    packed = schedule.place(["study", "steps"], SLOTS, "packed")
    assert len(by_key(light)["study"]) == 3 and len(by_key(packed)["study"]) == 1
    assert (by_key(light)["steps"][0].end - by_key(light)["steps"][0].start) == timedelta(minutes=30)
    assert (by_key(packed)["steps"][0].end - by_key(packed)["steps"][0].start) == timedelta(minutes=10)


def test_what_does_not_fit_is_skipped_not_forced():
    tiny = [shape.Slot(at(12), at(12, 20))]
    items = schedule.place(["workouts", "steps"], tiny, "normal")
    assert [i.key for i in items] == [
        "steps"
    ]  # a 30 minute workout does not fit 20 minutes; a 20 minute walk does
    assert schedule.place(["steps"], [], "light") == []


def test_unknown_or_unscheduled_focus_areas_are_ignored():
    assert schedule.place(["unplug", "sleep", "nope"], SLOTS, "normal") == []


# ---------------------------------------------------------------- bedtime


def night(first_start, usual_bed=time(23, 0), need=450):
    return schedule.night_plan(MON, TZ, first_start, usual_bed, time(7, 0), need)


def test_an_early_start_moves_bedtime_earlier_so_the_sleep_need_still_fits():
    n = night(at(8, 0, MON + timedelta(days=1)))
    assert (n.wake, n.bed) == (at(6, 30, MON + timedelta(days=1)), at(22, 45))
    assert n.shifted_min == 15 and "8:00 am" in n.reason
    n = night(at(7, 0, MON + timedelta(days=1)))
    assert (n.wake, n.bed, n.shifted_min) == (at(5, 30, MON + timedelta(days=1)), at(21, 45), 75)


def test_a_free_morning_keeps_the_usual_bedtime_and_wake_time():
    tomorrow = MON + timedelta(days=1)
    for first in (None, at(14, 0, tomorrow)):
        n = night(first)
        assert (n.bed, n.wake, n.shifted_min) == (at(23, 0), at(7, 0, tomorrow), 0)


def test_wake_time_never_goes_before_five():
    n = night(at(5, 30, MON + timedelta(days=1)))
    assert n.wake == at(5, 0, MON + timedelta(days=1))


def test_a_very_late_usual_bedtime_is_pulled_earlier_to_fit_the_sleep_need():
    n = night(None, usual_bed=time(0, 30))
    assert n.bed == at(23, 15) and n.shifted_min == 75


def test_wind_down_appears_only_for_sleep_unplug_or_routine_picks():
    n = night(at(8, 0, MON + timedelta(days=1)))
    assert schedule.wind_down(["steps", "study"], n) is None
    item = schedule.wind_down(["sleep"], n)
    assert (item.start, item.end) == (at(22, 15), at(22, 45))
    assert "10:45 pm" in item.title and "8:00 am" in item.why
    assert "Screens off." in schedule.wind_down(["unplug"], n).why
    assert "body clock" in schedule.wind_down(["routine"], n).why


def test_repeat_blocks_are_spread_out_when_the_day_has_room():
    slots = [shape.Slot(at(9), at(12)), shape.Slot(at(14), at(17))]
    study = [i for i in schedule.place(["study"], slots, "light") if i.key == "study"]
    assert len(study) == 3
    for a, b in zip(study, study[1:], strict=False):
        assert b.start - a.end >= timedelta(minutes=schedule.SAME_KIND_APART_MIN)


def test_repeat_blocks_go_back_to_back_rather_than_being_dropped_when_the_day_is_tight():
    slots = [shape.Slot(at(14), at(16, 5))]
    study = [i for i in schedule.place(["study"], slots, "normal") if i.key == "study"]
    assert len(study) == 2
    assert study[1].start - study[0].end == timedelta(minutes=schedule.GAP_MIN)


def test_planned_keys_add_sun_items_for_skin_cancer_and_a_skin_check_on_the_first_sunday():
    sunday = date(2026, 10, 4)
    assert schedule.planned_keys([], {"skin_cancer"}, date(2026, 10, 5)) == ["sun", "sun_reapply"]
    assert schedule.planned_keys([], {"skin_cancer"}, sunday)[-1] == "skin_check"
    assert schedule.planned_keys([], {"skin_cancer"}, date(2026, 10, 11)) == ["sun", "sun_reapply"]
    assert schedule.planned_keys(["sun"], set(), date(2026, 10, 5)) == ["sun", "sun_reapply"]
    assert schedule.planned_keys(["steps"], set(), sunday) == ["steps"]
    assert schedule.planned_keys(["hydration", "steps"], {"ckd"}, sunday) == ["steps"]


def test_a_strict_template_is_skipped_rather_than_moved_outside_its_hours():
    morning_only = [shape.Slot(at(8), at(10))]
    assert schedule.place(["sun_reapply"], morning_only, "normal") == []
    assert [i.key for i in schedule.place(["sun"], morning_only, "normal")] == ["sun"]


def test_sunscreen_gets_the_morning_and_the_reapply_follows_two_hours_later():
    day = [shape.Slot(at(8), at(18))]
    items = schedule.place(schedule.planned_keys(["study"], {"skin_cancer"}, date(2026, 10, 5)), day, "light")
    by_key = {i.key: i for i in items}
    assert by_key["sun"].start.hour in (8, 9)
    assert (by_key["sun_reapply"].start - by_key["sun"].end).total_seconds() >= 2 * 3600
    assert 12 <= by_key["sun_reapply"].start.hour < 15


def test_the_reapply_is_dropped_when_the_morning_item_could_not_be_placed():
    assert schedule.place(["sun_reapply"], [shape.Slot(at(12), at(15))], "normal") == []


def test_focus_lines_describe_each_area_without_clock_times():
    from app.planner import render

    def it(key):
        return {"key": key, "title": key, "start": at(10), "end": at(11)}

    items = [it("study"), it("study"), it("steps"), it("sun"), it("sun_reapply"), it("wind_down")]
    lines = render.focus_lines(["sleep", "steps", "study", "stress"], items, at(23, 30))
    assert lines == [
        "• Sleep better: a wind-down, lights out around 11:30 pm",
        "• Move more: a walk",
        "• Build better study habits: 2 study blocks",
        "• Feel less stressed: nothing scheduled today",
        "• Protect my skin: sunscreen, a reapply",
    ]
