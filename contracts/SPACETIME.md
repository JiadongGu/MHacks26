# Spacetime live pool — contract

Replaces Tiger (decided 2026-10-03). SpacetimeDB v2.10, TypeScript module, hosted on maincloud. Neon stays the long-term pool and source of truth for alerts, proposals, twin, goals.

Owners (changed 2026-10-03): **J** owns the module (`infra/spacetime/`, tables, reducers, rollup, views, publish) and its consumers (rules reads, live dashboard). **P** writes into it from the ingest side (Fitbit sync, Apple Watch simulator, `/ingest/*`) through `spacetime.call("ingest", ...)` only.

## Facts that constrain the design (verified 2026-10-03)
- Python has no maintained SDK. The agent uses the HTTP API: `POST {host}/v1/database/{db}/call/{reducer}` (JSON array of args) and `POST {host}/v1/database/{db}/sql` (plain-text SQL), `Authorization: Bearer <token>`.
- HTTP SQL: `SELECT ... FROM t [WHERE ...] [LIMIT n]` only. No ORDER BY, GROUP BY, SUM/AVG. So rollups are precomputed in tables and filtered with integer comparisons.
- Timestamp JSON/SQL literal formats are undocumented, so every time column we filter on is a **`u64` epoch-milliseconds** column (`*_ms`).
- Public tables are readable by every client. Health data stays in **private** tables; browsers read through **views** scoped to `ctx.sender`.
- Reducers: no network, use `ctx.timestamp`, not `Date.now()`.
- Free maincloud pauses idle databases (resume in seconds). Warm before demo.

## Names (snake_case so SQL is plain)
Database: **`pulse-live-t8ng8`** on maincloud (names are global; dashboard https://spacetimedb.com/pulse-live-t8ng8). Module source: `infra/spacetime/spacetimedb/src/index.ts`. Env: `SPACETIME_HOST=https://maincloud.spacetimedb.com`, `SPACETIME_DB=pulse-live-t8ng8`, `SPACETIME_TOKEN` = the **owner** token (only the owner can SQL-read private tables; `ingest` only accepts identities in `admin`, seeded with the publisher). Share it privately, never commit. Get it with `spacetime login show --token`.

Publish: `cd infra/spacetime && spacetime publish pulse-live-t8ng8` (confirm the maincloud prompt).

Add a writer (e.g. P's local dev): they run `spacetime login` then `spacetime login show` and send their identity; an existing admin runs `spacetime call pulse-live-t8ng8 add_admin '"0x<identity>"'` (remove with `remove_admin`). Admins can call `ingest` with their own token but cannot SQL-read private tables (owner only) — the deployed agent uses the owner token.

```
sample      (private)  id u64 pk autoinc, user_id string btree, metric string, value f64,
                       unit string, source string, ts_ms u64 btree, meta_json string
            retention: 48h (deleted by rollup)
minute_agg  (private)  key string pk = "{user_id}|{metric}|{minute_ms}", user_id string btree,
                       metric string, minute_ms u64 btree, avg f64, min f64, max f64, sum f64, n u32
            retention: 30d
user_map    (private)  identity pk, user_id string btree        -- browser identity -> Neon Auth user id
```
`metric`, `source`, `unit` use the values in `contracts/README.md` (Metric, Source enums).

Reducers:
- `ingest(rows: SampleIn[])`, `SampleIn = {user_id, metric, value, unit, source, ts_ms, meta_json}`. Owner-only (reject other `ctx.sender`). Upserts `minute_agg` for touched minutes in the same transaction, so reads are fresh without waiting for the schedule. **Must be idempotent on `(user_id, metric, source, ts_ms)`**: the Fitbit poller re-sends an overlapping 30-minute window every 5 minutes, so a repeated row replaces the stored one and `minute_agg` is recomputed from `sample`, never incremented.
- `rollup` scheduled every 60s: retention deletes (and any catch-up).
- `link_identity(user_id, proof)`: J will define with the web step; not needed for step 3.

Views (public, web dashboard; J adds with the web step): `my_minute_agg`, `my_samples` filtered by `user_map[ctx.sender]`.

## Python reads (J's rules, P's `/vitals/*`)
Use `app/core/spacetime.py`:
```python
rows = await spacetime.sql(f"SELECT * FROM minute_agg WHERE user_id = '{uid}' AND minute_ms >= {since_ms}")
await spacetime.call("ingest", [rows])
```
`uid` must be a validated UUID before interpolation (no parameter binding over HTTP). Sort in Python.

## Verified live (2026-10-03)
- Owner token SELECTs private tables; anonymous identity gets "no such table" for `sample` and `ingest` is rejected.
- `/sql` returns `[{schema:{elements:[{name:{some}}]}, rows}]`; `app/core/spacetime.py` parses it.
- `ingest` is idempotent on `(user_id, metric, source, ts_ms)`: resend leaves `n` unchanged; a corrected value adjusts `sum`/`avg` (`min`/`max` only widen).
- Retention: scheduled `retention` every 10 min (u64 range delete builds; not yet observed firing).
