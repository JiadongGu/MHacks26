"""Judgement for the planner: what makes a time good, what to schedule besides the focus areas, and what
to study. Pure code, no I/O.

A free gap is not automatically a good time. Study wants the hours when attention is best and a gap with
room to settle; exercise should not land right before bed; a short workout is a better break between study
blocks than another study block. Upcoming exams and course names on the calendar steer what the study
blocks are about.
"""

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

EXAM_RE = re.compile(
    r"\b(exam|midterm|final(?!\s+(?:project|presentation|paper|report))|quiz|test|assessment|practical|oral)\b",
    re.I,
)
COURSE_RE = re.compile(r"\b([A-Z]{2,5})[ -]?(\d{3}[A-Z]?)\b")
EXAM_HORIZON_DAYS = 14
FOCUS_EXAM_DAYS = 7  # inside this, the study blocks are about the exam

# Hours of the day, best first, as (from, to, weight). Anything outside scores OFF_PEAK, or nothing if the
# key is in NIGHT_OFF.
CURVES: dict[str, tuple[tuple[float, float, float], ...]] = {
    "study": ((9, 12, 1.0), (14, 17, 0.85), (19, 21, 0.65), (7, 9, 0.5), (17, 19, 0.4), (12, 14, 0.35)),
    "workouts": ((16, 19, 1.0), (7, 9, 0.8), (12, 14, 0.7), (9, 12, 0.5), (14, 16, 0.5)),
    "move": ((12, 14, 0.9), (15, 18, 1.0), (9, 12, 0.6), (18, 19, 0.5)),
    "break": ((10, 12, 0.9), (14, 17, 1.0), (12, 14, 0.6), (17, 19, 0.4)),
    "skin_check": ((18, 21, 1.0), (9, 12, 0.6)),
}
OFF_PEAK = 0.35
NIGHT_OFF = {"study", "workouts", "move", "break"}  # never at the margins of the day
MIN_SCORE = 0.3
MEAL_WINDOWS = {"study": ((12.0, 13.25), (18.0, 19.0)), "workouts": ((12.0, 13.0), (18.0, 19.0))}
EXERCISE = {"workouts", "move"}
BED_BUFFER_MIN = 120  # no exercise in the two hours before lights out
STEP_MIN = 15

VARIANTS: dict[str, tuple[str, ...]] = {
    "steps": ("Walk", "Fresh-air walk", "Walk and reset"),
    "workouts": ("Workout", "Strength session", "Cardio session", "Mobility and core"),
    "heart": ("Easy heart-health walk", "Gentle walk and slow breathing"),
    "stress": ("Breathing break", "Box breathing (in 4, hold 4, out 4, hold 4)", "5-4-3-2-1 grounding"),
    "balance": ("Take a real break", "Step outside for a break", "Screen-free break"),
    "move": ("Quick workout", "Brisk walk outside", "Stretch and mobility", "Bodyweight circuit"),
}
STUDY_MODES = ("Deep study", "Review", "Practice problems")
# Names for a study block with no subject, rotated by day so the calendar does not read the same every day.
GENERIC_STUDY = {
    "Deep study": ("Deep study block", "Hardest thing first", "Focus block"),
    "Review": ("Review and flashcards", "Review your notes", "Recap what you learned"),
    "Practice problems": ("Practice problems", "Practice questions", "Test yourself"),
}


@dataclass(frozen=True)
class Exam:
    title: str
    subject: str | None
    days_away: int


@dataclass
class Context:
    day: date = field(default_factory=date.today)
    exams: list[Exam] = field(default_factory=list)
    courses: list[str] = field(default_factory=list)
    bed: datetime | None = None

    @property
    def exam(self) -> Exam | None:
        return self.exams[0] if self.exams else None

    @property
    def exam_near(self) -> Exam | None:
        e = self.exam
        return e if e is not None and e.days_away <= FOCUS_EXAM_DAYS else None


def _subject(title: str) -> str | None:
    cleaned = re.sub(r"[\(\[].*?[\)\]]", " ", title)
    cleaned = EXAM_RE.sub(" ", cleaned)
    cleaned = re.sub(r"\b(review|session|study|prep|room|hall|building)\b.*$", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"[-–:,|/]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned if 2 <= len(cleaned) <= 40 else None


def parse_exams(events: list[dict[str, Any]], day: date, tz: Any) -> list[Exam]:
    """Exams, midterms and quizzes on the calendar in the next two weeks, soonest first."""
    out: list[Exam] = []
    for e in events:
        title = str(e.get("title") or "")
        if not EXAM_RE.search(title):
            continue
        local = e["starts_at"].astimezone(tz).date()
        away = (local - day).days
        if 0 <= away <= EXAM_HORIZON_DAYS:
            out.append(Exam(title.strip(), _subject(title), away))
    return sorted(out, key=lambda x: x.days_away)


def find_courses(events: list[dict[str, Any]]) -> list[str]:
    """Course codes like 'EECS 281' from event titles, most frequent first."""
    seen: dict[str, int] = {}
    for e in events:
        for m in COURSE_RE.finditer(str(e.get("title") or "")):
            code = f"{m.group(1)} {m.group(2)}"
            seen[code] = seen.get(code, 0) + 1
    return [c for c, _ in sorted(seen.items(), key=lambda kv: (-kv[1], kv[0]))]


def when_phrase(days: int) -> str:
    return "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"


def repeat_for(key: str, load: str, base: int, ctx: Context) -> int:
    """How many blocks. An exam close by adds study time, but never to a packed day."""
    if key != "study" or load == "packed":
        return base
    exam = ctx.exam_near
    if exam is None:
        return base
    extra = 1 if exam.days_away <= 2 else 0
    return min(4, max(base, 2) + extra)


def subject_for(n: int, repeat: int, ctx: Context) -> str | None:
    """Subject of the n-th study block (0 based): the exam first, then the courses in rotation."""
    exam = ctx.exam_near
    if exam is not None and exam.subject and n < max(1, (repeat + 1) // 2):
        return exam.subject
    pool = [c for c in ctx.courses if exam is None or c != exam.subject]
    if exam is not None and exam.subject and not pool:
        return exam.subject
    return pool[(ctx.day.toordinal() + n) % len(pool)] if pool else None


def variant(
    key: str, n: int, repeat: int, ctx: Context, default_title: str, default_why: str
) -> tuple[str, str]:
    """A title and a reason for the n-th block of `key`, so days do not all read the same."""
    if key == "study":
        mode = STUDY_MODES[n % len(STUDY_MODES)]
        subject = subject_for(n, repeat, ctx)
        exam = ctx.exam_near
        generic = GENERIC_STUDY[mode][ctx.day.toordinal() % len(GENERIC_STUDY[mode])]
        titles = {
            "Deep study": f"Deep study: {subject}" if subject else generic,
            "Review": f"Review {subject} notes" if subject else generic,
            "Practice problems": f"Practice problems: {subject}" if subject else generic,
        }
        if exam is not None and subject == exam.subject:
            why = f"{exam.title} is {when_phrase(exam.days_away)}. Steady blocks now beat cramming later."
        else:
            why = {
                "Deep study": "Your best hours for hard thinking, protected before the day fills up.",
                "Review": "Going back over notes soon after learning them makes them stick.",
                "Practice problems": "Doing problems tells you what you actually know.",
            }[mode]
        return titles[mode], why
    names = VARIANTS.get(key)
    if names:
        return names[(ctx.day.toordinal() + n) % len(names)], default_why
    return default_title, default_why


def hour_weight(key: str, hour: float, prefer: tuple[tuple[int, int], ...], ctx: Context) -> float:
    curve = CURVES.get(key)
    if curve is not None:
        for lo, hi, w in curve:
            if lo <= hour < hi:
                base = w
                break
        else:
            base = 0.0 if key in NIGHT_OFF else OFF_PEAK
        exam = ctx.exam_near
        if key == "study" and exam is not None and exam.days_away <= 2 and 8 <= hour < 21:
            base = max(base, 0.6)  # close to an exam, any sensible hour will do
        return base
    for rank, (lo, hi) in enumerate(prefer):
        if lo <= hour < hi:
            return 1.0 - 0.15 * rank
    return OFF_PEAK


def score(
    key: str,
    start: datetime,
    end: datetime,
    slot: tuple[datetime, datetime],
    prefer: tuple[tuple[int, int], ...],
    placed: list[Any],
    ctx: Context,
    spread_min: int,
    spacing: bool,
) -> float:
    """How good this exact time is for this kind of block. Higher is better."""
    mid = start + (end - start) / 2
    hour = mid.hour + mid.minute / 60
    # Judge start, middle and end, so a block that begins in a poor hour is not rated by its middle.
    points = [start, mid, end - timedelta(minutes=1)]
    hours = [p.hour + p.minute / 60 for p in points]
    s = sum(hour_weight(key, h, prefer, ctx) for h in hours) / len(hours)
    for lo, hi in MEAL_WINDOWS.get(key, ()):
        if lo <= hour < hi:
            s -= 0.3
    # Room to settle: a block hugging both ends of a tight gap feels rushed.
    if (start - slot[0]) >= timedelta(minutes=10) or (slot[1] - end) >= timedelta(minutes=10):
        s += 0.05
    if spacing:
        for p in placed:
            gap = timedelta(minutes=spread_min)
            near = p.start - gap < end and start < p.end + gap
            if p.key == key and near:
                s -= 0.5
    if key in EXERCISE and ctx.bed is not None and end > ctx.bed - timedelta(minutes=BED_BUFFER_MIN):
        s -= 0.6
    if key in ("move", "break"):
        for p in placed:
            if p.key == "study" and timedelta(minutes=5) <= start - p.end <= timedelta(minutes=60):
                s += 0.25
    return s


def companions(picks: list[str], load: str, ctx: Context) -> list[str]:
    """Extra items that support the focus without being picked: a workout now and then, and a break between
    study blocks. Quiet days only, and never on the day of an exam."""
    if "study" not in picks or load == "packed":
        return []
    if ctx.exam is not None and ctx.exam.days_away == 0:
        return []
    if not any(k in picks for k in ("workouts", "steps", "heart")) and ctx.day.toordinal() % 3 == 0:
        return ["move"]  # the workout is the break
    if repeat_for("study", load, {"light": 3, "normal": 2}.get(load, 1), ctx) >= 2:
        return ["break"]
    return []


def hour_weight_prefer(mid: datetime, prefer: tuple[tuple[int, int], ...]) -> float:
    """1 inside any preferred hour range, else 0. Used by templates that must stay inside their hours."""
    hour = mid.hour + mid.minute / 60
    return 1.0 if any(lo <= hour < hi for lo, hi in prefer) else 0.0
