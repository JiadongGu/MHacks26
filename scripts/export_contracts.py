"""Export Pydantic contracts to contracts/schemas/*.schema.json. `--check` exits 1 if stale."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "services" / "agent"))

from app.contracts import EXPORTED  # noqa: E402

OUT = ROOT / "contracts" / "schemas"


def render() -> dict[str, str]:
    return {f"{m.__name__}.schema.json": json.dumps(m.model_json_schema(), indent=2) + "\n" for m in EXPORTED}


def main() -> int:
    files = render()
    if "--check" in sys.argv:
        stale = [n for n, t in files.items() if not (OUT / n).exists() or (OUT / n).read_text() != t]
        extra = [p.name for p in OUT.glob("*.schema.json") if p.name not in files] if OUT.exists() else []
        if stale or extra:
            print("contracts stale:", stale + extra)
            return 1
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.schema.json"):
        if p.name not in files:
            p.unlink()
    for n, t in files.items():
        (OUT / n).write_text(t)
    print(f"wrote {len(files)} schemas to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
