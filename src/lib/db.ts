import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Pooled Lakebase Postgres for Next.js route handlers.
 * Prefer DATABASE_URL (pooled). Use DATABASE_URL_UNPOOLED only for migrations.
 */
export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

let sql: NeonQueryFunction<false, false> | null = null;
let cachedUrl = "";

export function getSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not configured.");
  if (!sql || cachedUrl !== url) {
    sql = neon(url);
    cachedUrl = url;
  }
  return sql;
}
