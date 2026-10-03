// Pulse live pool. Contract: contracts/SPACETIME.md
import { ScheduleAt } from 'spacetimedb';
import { Range, SenderError, schema, table, t } from 'spacetimedb/server';

const MINUTE_MS = 60_000n;
const SAMPLE_RETENTION_MS = 48n * 3_600_000n;
const AGG_RETENTION_MS = 30n * 24n * 3_600_000n;

const admin = table({ name: 'admin' }, { identity: t.identity().primaryKey() });

const sample = table(
  { name: 'sample' },
  {
    key: t.string().primaryKey(), // `${user_id}|${metric}|${source}|${ts_ms}`
    user_id: t.string().index('btree'),
    metric: t.string(),
    value: t.f64(),
    unit: t.string(),
    source: t.string(),
    ts_ms: t.u64().index('btree'),
    meta_json: t.string(),
  }
);

const minuteAgg = table(
  { name: 'minute_agg' },
  {
    key: t.string().primaryKey(), // `${user_id}|${metric}|${minute_ms}`
    user_id: t.string().index('btree'),
    metric: t.string(),
    minute_ms: t.u64().index('btree'),
    avg: t.f64(),
    min: t.f64(),
    max: t.f64(),
    sum: t.f64(),
    n: t.u32(),
  }
);

const retentionTimer = table(
  { name: 'retention_timer' },
  { scheduled_id: t.u64().primaryKey().autoInc(), scheduled_at: t.scheduleAt() }
);

// Admins other than the owner cannot SQL-read private tables, so they read watched users via views.
const watch = table(
  { name: 'watch' },
  { id: t.u64().primaryKey().autoInc(), watcher: t.identity().index('btree'), user_id: t.string() }
);

const spacetimedb = schema({ admin, sample, minuteAgg, retentionTimer, watch });
export default spacetimedb;

const SampleIn = t.object('SampleIn', {
  user_id: t.string(),
  metric: t.string(),
  value: t.f64(),
  unit: t.string(),
  source: t.string(),
  ts_ms: t.u64(),
  meta_json: t.string(),
});

export const init = spacetimedb.init(ctx => {
  ctx.db.admin.insert({ identity: ctx.sender });
  ctx.db.retentionTimer.insert({ scheduled_id: 0n, scheduled_at: ScheduleAt.interval(10n * 60_000_000n) });
});

export const add_admin = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError('unauthorized');
  if (!ctx.db.admin.identity.find(identity)) ctx.db.admin.insert({ identity });
});

export const remove_admin = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError('unauthorized');
  if (identity.equals(ctx.sender)) throw new SenderError('cannot remove yourself');
  ctx.db.admin.identity.delete(identity);
});

export const watch_user = spacetimedb.reducer({ user_id: t.string() }, (ctx, { user_id }) => {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError('unauthorized');
  for (const w of ctx.db.watch.watcher.filter(ctx.sender)) if (w.user_id === user_id) return;
  ctx.db.watch.insert({ id: 0n, watcher: ctx.sender, user_id });
});

export const unwatch_user = spacetimedb.reducer({ user_id: t.string() }, (ctx, { user_id }) => {
  for (const w of [...ctx.db.watch.watcher.filter(ctx.sender)]) if (w.user_id === user_id) ctx.db.watch.id.delete(w.id);
});

export const admin_minute_agg = spacetimedb.view(
  { name: 'admin_minute_agg', public: true },
  t.array(minuteAgg.rowType),
  ctx => {
    if (!ctx.db.admin.identity.find(ctx.sender)) return [];
    return [...ctx.db.watch.watcher.filter(ctx.sender)].flatMap(w => [...ctx.db.minuteAgg.user_id.filter(w.user_id)]);
  }
);

export const admin_sample = spacetimedb.view(
  { name: 'admin_sample', public: true },
  t.array(sample.rowType),
  ctx => {
    if (!ctx.db.admin.identity.find(ctx.sender)) return [];
    return [...ctx.db.watch.watcher.filter(ctx.sender)].flatMap(w => [...ctx.db.sample.user_id.filter(w.user_id)]);
  }
);

export const ingest = spacetimedb.reducer({ rows: t.array(SampleIn) }, (ctx, { rows }) => {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError('unauthorized');
  for (const r of rows) {
    const key = `${r.user_id}|${r.metric}|${r.source}|${r.ts_ms}`;
    const prev = ctx.db.sample.key.find(key);
    if (prev && prev.value === r.value) continue;
    const row = { key, ...r };
    if (prev) ctx.db.sample.key.update(row);
    else ctx.db.sample.insert(row);

    const minute = (r.ts_ms / MINUTE_MS) * MINUTE_MS;
    const aggKey = `${r.user_id}|${r.metric}|${minute}`;
    const agg = ctx.db.minuteAgg.key.find(aggKey);
    if (!agg) {
      ctx.db.minuteAgg.insert({
        key: aggKey, user_id: r.user_id, metric: r.metric, minute_ms: minute,
        avg: r.value, min: r.value, max: r.value, sum: r.value, n: 1,
      });
      continue;
    }
    const sum = agg.sum + r.value - (prev ? prev.value : 0);
    const n = agg.n + (prev ? 0 : 1);
    ctx.db.minuteAgg.key.update({
      ...agg, sum, n, avg: sum / n, min: Math.min(agg.min, r.value), max: Math.max(agg.max, r.value),
    });
  }
});

export const retention = spacetimedb.reducer(
  { onSchedule: retentionTimer },
  { timer: retentionTimer.rowType },
  (ctx, _args) => {
    const nowMs = ctx.timestamp.microsSinceUnixEpoch / 1000n;
    ctx.db.sample.ts_ms.delete(new Range({ tag: 'unbounded' }, { tag: 'excluded', value: nowMs - SAMPLE_RETENTION_MS }));
    ctx.db.minuteAgg.minute_ms.delete(
      new Range({ tag: 'unbounded' }, { tag: 'excluded', value: nowMs - AGG_RETENTION_MS })
    );
  }
);
