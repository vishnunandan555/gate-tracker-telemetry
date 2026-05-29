import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Redis } from '@upstash/redis';
import IORedis from 'ioredis';

const RETENTION_DAYS = 30;
const RECENT_LIMIT = 12;

let sqliteDb;
let redisClient;

function resolveProvider() {
  const explicit = String(process.env.DB_PROVIDER || '').toLowerCase();

  if (explicit === 'sqlite' || explicit === 'redis') {
    return explicit;
  }

  if (
    process.env.KV_REST_API_URL ||
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.VERCEL
  ) {
    return 'redis';
  }

  return 'sqlite';
}

export const provider = resolveProvider();

function utcDateParts(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return {
    date: `${year}-${month}-${day}`,
    timestamp: date.toISOString(),
  };
}

function normalizeLabel(value, fallback = 'unknown') {
  const text = String(value ?? '').trim();

  if (!text) {
    return fallback;
  }

  return text.slice(0, 80);
}

function isValidDailyToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token.trim());
}

function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  // Prefer official Redis for Vercel (Redis Cloud) which exposed a TCP/TLS URL
  // e.g. REDIS_URL or REDIS_TLS_URL. If present, use ioredis to connect.
  const tcpUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL || process.env.VERCEL_REDIS_URL;

  if (tcpUrl) {
    // ioredis accepts redis:// or rediss:// style URLs including auth
    redisClient = new IORedis(tcpUrl);
    return redisClient;
  }

  // Fallback: support Upstash REST-style Redis using @upstash/redis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error('Redis is enabled, but no supported Redis environment variables were found. Expected REDIS_URL (Vercel Redis) or Upstash REST vars.');
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function getSqliteDb() {
  if (sqliteDb) {
    return sqliteDb;
  }

  const dbFile = path.resolve(process.cwd(), process.env.SQLITE_DB_PATH || 'telemetry.db');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });

  sqliteDb = new Database(dbFile);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS pings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      daily_token TEXT NOT NULL,
      version TEXT NOT NULL,
      platform TEXT NOT NULL,
      created_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(daily_token, created_date)
    );

    CREATE INDEX IF NOT EXISTS idx_pings_created_date ON pings(created_date);
    CREATE INDEX IF NOT EXISTS idx_pings_created_at ON pings(created_at);
  `);

  return sqliteDb;
}

function rangeDays(days) {
  const values = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    values.push(utcDateParts(date).date);
  }

  return values;
}

function formatSeries(rows, dates) {
  const map = new Map(rows.map((row) => [row.date, row.count]));
  return dates.map((date) => ({
    date,
    count: Number(map.get(date) || 0),
  }));
}

async function recordPingRedis(payload) {
  const client = getRedisClient();
  const { date, timestamp } = utcDateParts(payload.createdAt);
  const safeVersion = normalizeLabel(payload.version);
  const safePlatform = normalizeLabel(payload.platform);

  const uniqueKey = `telemetry:dau:${date}`;
  const versionKey = `telemetry:versions:${date}`;
  const platformKey = `telemetry:platforms:${date}`;
  const pingKey = `telemetry:pings:${date}`;
  const recentKey = 'telemetry:recent';

  const added = await client.sadd(uniqueKey, payload.dailyToken);

  await client.expire(uniqueKey, RETENTION_DAYS * 24 * 60 * 60);
  await client.hincrby(versionKey, safeVersion, 1);
  await client.hincrby(platformKey, safePlatform, 1);
  await client.incr(pingKey);
  await client.expire(versionKey, RETENTION_DAYS * 24 * 60 * 60);
  await client.expire(platformKey, RETENTION_DAYS * 24 * 60 * 60);
  await client.expire(pingKey, RETENTION_DAYS * 24 * 60 * 60);

  if (added === 1) {
    await client.lpush(
      recentKey,
      JSON.stringify({
        daily_token: payload.dailyToken,
        version: safeVersion,
        platform: safePlatform,
        created_date: date,
        created_at: timestamp,
      })
    );
    await client.ltrim(recentKey, 0, RECENT_LIMIT - 1);
    await client.expire(recentKey, RETENTION_DAYS * 24 * 60 * 60);
  }

  return {
    duplicated: added === 0,
    createdAt: timestamp,
    createdDate: date,
  };
}

async function getStatsRedis() {
  const client = getRedisClient();
  const dates = rangeDays(7);
  const today = dates[dates.length - 1];

  const trend = await Promise.all(
    dates.map(async (date) => ({
      date,
      count: Number(await client.scard(`telemetry:dau:${date}`) || 0),
    }))
  );

  const [todayActiveUsers, todayPings, versionsRaw, platformsRaw, recentRaw] = await Promise.all([
    client.scard(`telemetry:dau:${today}`),
    client.get(`telemetry:pings:${today}`),
    client.hgetall(`telemetry:versions:${today}`),
    client.hgetall(`telemetry:platforms:${today}`),
    client.lrange('telemetry:recent', 0, RECENT_LIMIT - 1),
  ]);

  const versions = Object.entries(versionsRaw || {})
    .map(([label, count]) => ({ label, count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const platforms = Object.entries(platformsRaw || {})
    .map(([label, count]) => ({ label, count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const recentPings = (recentRaw || []).map((entry) => JSON.parse(entry));

  return {
    provider,
    date: today,
    daily_active_users: Number(todayActiveUsers || 0),
    accepted_pings: Number(todayPings || 0),
    trend,
    versions,
    platforms,
    recent_pings: recentPings,
    updated_at: new Date().toISOString(),
  };
}

function recordPingSqlite(payload) {
  const db = getSqliteDb();
  const { date, timestamp } = utcDateParts(payload.createdAt);
  const safeVersion = normalizeLabel(payload.version);
  const safePlatform = normalizeLabel(payload.platform);

  const insert = db.prepare(
    `INSERT INTO pings (daily_token, version, platform, created_date, created_at)
     VALUES (@dailyToken, @version, @platform, @createdDate, @createdAt)`
  );

  try {
    insert.run({
      dailyToken: payload.dailyToken,
      version: safeVersion,
      platform: safePlatform,
      createdDate: date,
      createdAt: timestamp,
    });

    return {
      duplicated: false,
      createdAt: timestamp,
      createdDate: date,
    };
  } catch (error) {
    if (String(error?.code || '').includes('SQLITE_CONSTRAINT')) {
      return {
        duplicated: true,
        createdAt: timestamp,
        createdDate: date,
      };
    }

    throw error;
  }
}

function getStatsSqlite() {
  const db = getSqliteDb();
  const dates = rangeDays(7);
  const today = dates[dates.length - 1];

  const trendRows = db
    .prepare(
      `SELECT created_date AS date, COUNT(DISTINCT daily_token) AS count
       FROM pings
       WHERE created_date BETWEEN ? AND ?
       GROUP BY created_date
       ORDER BY created_date ASC`
    )
    .all(dates[0], today);

  const dailyActiveUsers = db
    .prepare(
      `SELECT COUNT(DISTINCT daily_token) AS count
       FROM pings
       WHERE created_date = ?`
    )
    .get(today);

  const acceptedPings = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM pings
       WHERE created_date = ?`
    )
    .get(today);

  const versions = db
    .prepare(
      `SELECT version AS label, COUNT(*) AS count
       FROM pings
       WHERE created_date = ?
       GROUP BY version
       ORDER BY count DESC, label ASC`
    )
    .all(today);

  const platforms = db
    .prepare(
      `SELECT platform AS label, COUNT(*) AS count
       FROM pings
       WHERE created_date = ?
       GROUP BY platform
       ORDER BY count DESC, label ASC`
    )
    .all(today);

  const recentPings = db
    .prepare(
      `SELECT daily_token, version, platform, created_date, created_at
       FROM pings
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(RECENT_LIMIT);

  return {
    provider,
    date: today,
    daily_active_users: Number(dailyActiveUsers?.count || 0),
    accepted_pings: Number(acceptedPings?.count || 0),
    trend: formatSeries(trendRows, dates),
    versions,
    platforms,
    recent_pings: recentPings,
    updated_at: new Date().toISOString(),
  };
}

export async function recordPing(payload) {
  if (!isValidDailyToken(payload.dailyToken)) {
    const error = new Error('dailyToken must be a 64-character SHA-256 hex string.');
    error.status = 400;
    throw error;
  }

  if (provider === 'redis') {
    return recordPingRedis(payload);
  }

  return recordPingSqlite(payload);
}

export async function getStats() {
  if (provider === 'redis') {
    return getStatsRedis();
  }

  return getStatsSqlite();
}

export async function getHealth() {
  if (provider === 'redis') {
    const client = getRedisClient();
    const pong = await client.ping();

    return {
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      database: pong === 'PONG' ? 'connected' : 'unhealthy',
      provider,
    };
  }

  const db = getSqliteDb();
  const probe = db.prepare('SELECT 1 AS ok').get();

  return {
    status: probe?.ok === 1 ? 'healthy' : 'degraded',
    database: probe?.ok === 1 ? 'connected' : 'unhealthy',
    provider,
  };
}

export function validatePingPayload(body) {
  const dailyToken = typeof body?.dailyToken === 'string' ? body.dailyToken.trim() : '';
  const version = normalizeLabel(body?.version);
  const platform = normalizeLabel(body?.platform);

  if (!dailyToken || !isValidDailyToken(dailyToken)) {
    return { ok: false, error: 'dailyToken must be a 64-character SHA-256 hex string.' };
  }

  if (!version) {
    return { ok: false, error: 'version is required.' };
  }

  if (!platform) {
    return { ok: false, error: 'platform is required.' };
  }

  return {
    ok: true,
    value: {
      dailyToken,
      version,
      platform,
      createdAt: new Date(),
    },
  };
}