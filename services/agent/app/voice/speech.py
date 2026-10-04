"""Make written text sound right when read aloud. Pure code, no I/O.

The briefing is written to be read ("6.0 h", "62 bpm", bullets, labels). A voice reads that literally, so
this turns it into the words a person would say.
"""

import re

_HOURS_MINUTES = re.compile(r"(\d+)\s*h\s+(\d+)\s*min\b")
_HOURS = re.compile(r"(\d+(?:\.\d+)?)\s*h\b")
_MINUTES = re.compile(r"(\d+)\s*min\b")
_NUMBER_UNITS = [
    (re.compile(r"(\d)\s*bpm\b", re.I), r"\1 beats per minute"),
    (re.compile(r"(\d)\s*ms\b"), r"\1 milliseconds"),
    (re.compile(r"(\d)\s*kcal\b", re.I), r"\1 calories"),
    (re.compile(r"(\d)\s*%"), r"\1 percent"),
]
_WORDS = [
    (re.compile(r"\bSpO2\b", re.I), "blood oxygen"),
    (re.compile(r"\bHRV\b"), "heart rate variability"),
    (re.compile(r"\bSPF\b"), "S P F"),
    (re.compile(r"\bRHR\b"), "resting heart rate"),
]


def _plural(n: float, one: str, many: str) -> str:
    return f"{n:g} {one if n == 1 else many}"


def _hours(m: re.Match[str]) -> str:
    value = float(m.group(1))
    return _plural(int(value) if value == int(value) else value, "hour", "hours")


def speakable(text: str) -> str:
    """The same message, worded for speech."""
    out = text.replace("\r", "")
    out = _HOURS_MINUTES.sub(
        lambda m: (
            f"{_plural(int(m.group(1)), 'hour', 'hours')} {_plural(int(m.group(2)), 'minute', 'minutes')}"
        ),
        out,
    )
    out = _HOURS.sub(_hours, out)
    out = _MINUTES.sub(lambda m: _plural(int(m.group(1)), "minute", "minutes"), out)
    for pattern, repl in _NUMBER_UNITS:
        out = pattern.sub(repl, out)
    for pattern, repl in _WORDS:
        out = pattern.sub(repl, out)
    out = out.replace("[", "").replace("]", "").replace("·", ",")
    out = re.sub(r"^[ \t]*[•\-]\s*", "", out, flags=re.M)
    # Line breaks become sentence pauses, without doubling an existing full stop.
    lines = [line.strip() for line in out.split("\n")]
    spoken = ""
    for line in lines:
        if not line:
            continue
        spoken += (" " if spoken else "") + line
        if spoken[-1] not in ".!?:":
            spoken += "."
    return re.sub(r"\s+", " ", spoken).strip()
