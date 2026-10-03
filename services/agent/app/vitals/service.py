from collections import defaultdict
from datetime import UTC, datetime
from typing import Any, Literal

Bucket = Literal["raw", "1m", "1h", "1d"]
BUCKET_MS = {"raw": 60_000, "1m": 60_000, "1h": 3_600_000, "1d": 86_400_000}
# Metrics that are counts per minute; everything else is averaged.
SUM_METRICS = {"steps", "active_minutes", "active_energy_kcal"}


def _iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, UTC).isoformat()


def _value(metric: str, total: float, n: int) -> float:
    return round(total if metric in SUM_METRICS else total / n, 2)


def series(rows: list[dict[str, Any]], metric: str, bucket: str) -> list[dict[str, Any]]:
    """minute_agg rows to [{ts, value}], oldest first. Buckets align to UTC and are weighted by n."""
    size = BUCKET_MS[bucket]
    groups: dict[int, list[float]] = defaultdict(lambda: [0.0, 0])
    for r in rows:
        n = int(r["n"])
        if n <= 0:
            continue
        g = groups[int(r["minute_ms"]) // size * size]
        g[0] += float(r["sum"])
        g[1] += n
    return [{"ts": _iso(ms), "value": _value(metric, g[0], g[1])} for ms, g in sorted(groups.items())]


def latest(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """The most recent minute per metric."""
    newest: dict[str, dict[str, Any]] = {}
    for r in rows:
        if int(r["n"]) > 0 and (
            r["metric"] not in newest or r["minute_ms"] > newest[r["metric"]]["minute_ms"]
        ):
            newest[r["metric"]] = r
    return {
        m: {"ts": _iso(int(r["minute_ms"])), "value": _value(m, float(r["sum"]), int(r["n"]))}
        for m, r in newest.items()
    }
