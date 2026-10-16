export interface Env {
  DB: D1Database;
  STORE: R2Bucket;
  ASSETS: Fetcher;
  PROVIDER: string;
  STORE_MODE: string;
  BUNDLES: string;
  LEASE_SECS: string;
  MAX_ATTEMPTS: string;
  INLINE_THRESHOLD: string;
  MAX_BLOB_BYTES: string;
}

export interface Knobs {
  provider: string;
  leaseSecs: number;
  maxAttempts: number;
  inlineThreshold: number;
  maxBlobBytes: number;
  bundles: Array<Record<string, string>>;
}

export function knobsFromEnv(env: Env): Knobs {
  return {
    provider: env.PROVIDER || "cloudflare",
    leaseSecs: parseInt(env.LEASE_SECS || "60", 10),
    maxAttempts: parseInt(env.MAX_ATTEMPTS || "3", 10),
    inlineThreshold: parseInt(env.INLINE_THRESHOLD || "65536", 10),
    maxBlobBytes: parseInt(env.MAX_BLOB_BYTES || "10485760", 10),
    bundles: JSON.parse(env.BUNDLES || "[]"),
  };
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER);
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY, language TEXT NOT NULL, bundle TEXT NOT NULL,
  dag_json TEXT NOT NULL, policies_json TEXT NOT NULL DEFAULT '{}',
  code_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, status TEXT NOT NULL,
  bundle_version TEXT, inputs_json TEXT NOT NULL DEFAULT '{}',
  created_at REAL NOT NULL, started_at REAL, finished_at REAL);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, name TEXT NOT NULL,
  runtime TEXT NOT NULL, policy TEXT NOT NULL DEFAULT 'auto',
  code_ref TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0, lease_owner TEXT,
  lease_expires_at REAL, error TEXT, output_json TEXT);
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY, language TEXT NOT NULL, runtime TEXT NOT NULL,
  provider TEXT NOT NULL, core_version TEXT NOT NULL, last_seen REAL);
`;
