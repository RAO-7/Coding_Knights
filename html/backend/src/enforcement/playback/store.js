let db;

function initDatabase() {
  try {
    const Database = require('better-sqlite3');
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL, unix_ms INTEGER NOT NULL,
        ships_json TEXT NOT NULL, alerts_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(unix_ms);
    `);
    console.log('[Playback] SQLite initialised');
  } catch (err) {
    console.warn('[Playback] SQLite unavailable, using ring buffer:', err.message);
    db = null;
  }
}

const MAX_SNAPSHOTS = parseInt(process.env.PLAYBACK_MAX_SNAPSHOTS) || 120;
const ringBuffer = [];

function saveSnapshot(ships, alerts) {
  const snap = {
    ts: new Date().toISOString(), unix_ms: Date.now(),
    ships: ships.map((s) => ({
      id: s.id, name: s.name,
      lat: Math.round(s.lat * 10000) / 10000,
      lng: Math.round(s.lng * 10000) / 10000,
      heading: s.heading, speed: s.speed,
      status: s.status, fuel: Math.round(s.fuel * 10) / 10,
    })),
    alerts: alerts.slice(0, 20).map((a) => ({
      id: a.id, type: a.type, severity: a.severity,
      shipId: a.shipId, message: a.message, timestamp: a.timestamp,
    })),
  };

  if (db) {
    try {
      db.prepare('INSERT INTO snapshots (ts, unix_ms, ships_json, alerts_json) VALUES (?, ?, ?, ?)')
        .run(snap.ts, snap.unix_ms, JSON.stringify(snap.ships), JSON.stringify(snap.alerts));
      db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY unix_ms DESC LIMIT ?)').run(MAX_SNAPSHOTS);
    } catch (err) { console.error('[Playback] DB write failed:', err.message); }
  } else {
    ringBuffer.push(snap);
    if (ringBuffer.length > MAX_SNAPSHOTS) ringBuffer.shift();
  }
}

function getSnapshots(fromTs, toTs) {
  const toMs   = toTs   ? new Date(toTs).getTime()   : Date.now();
  const fromMs = fromTs ? new Date(fromTs).getTime() : toMs - 60 * 60 * 1000;
  if (db) {
    try {
      return db.prepare(
        'SELECT ts, unix_ms, ships_json, alerts_json FROM snapshots WHERE unix_ms BETWEEN ? AND ? ORDER BY unix_ms ASC'
      ).all(fromMs, toMs).map((r) => ({
        ts: r.ts, unix_ms: r.unix_ms,
        ships: JSON.parse(r.ships_json), alerts: JSON.parse(r.alerts_json),
      }));
    } catch (err) { console.error('[Playback] DB read failed:', err.message); }
  }
  return ringBuffer.filter((s) => s.unix_ms >= fromMs && s.unix_ms <= toMs);
}

function getTimeline() {
  if (db) {
    try { return db.prepare('SELECT id, ts, unix_ms FROM snapshots ORDER BY unix_ms ASC').all(); }
    catch (_) {}
  }
  return ringBuffer.map((s, i) => ({ id: i, ts: s.ts, unix_ms: s.unix_ms }));
}

const playbackStore = { saveSnapshot, getSnapshots, getTimeline };
module.exports = { playbackStore, initDatabase };