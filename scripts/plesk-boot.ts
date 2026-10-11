/**
 * Startdatei für Plesk (Node.js). Wird zu `app.js` gebündelt (scripts/build-plesk.sh).
 *  1. Datenbank-Migrationen anwenden (prisma/migrations/*)
 *  2. Rechte, Rollen und Standard-Stammdaten anlegen (idempotent, keine Demodaten)
 *  3. Next.js-Server starten
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { seedBase } from "../prisma/seed-base";

// Startprotokoll neben app.js (ohne Passwörter), damit Startfehler auch ohne Server-Logs sichtbar sind.
const LOG_FILE = path.join(__dirname, "startup.log");
function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(`[ff-wahlen] ${msg}`);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* Verzeichnis nicht beschreibbar */ }
}
process.on("uncaughtException", (e) => { log(`uncaughtException: ${e instanceof Error ? e.stack : String(e)}`); });
process.on("unhandledRejection", (e) => { log(`unhandledRejection: ${e instanceof Error ? e.stack : String(e)}`); });

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt (Plesk → Node.js → Benutzerdefinierte Umgebungsvariablen).");
  const dir = path.join(__dirname, "migrations");
  const client = new Client({ connectionString: url.replace(/[?&]schema=[^&]*/, "") });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727274)");
    await client.query(`CREATE TABLE IF NOT EXISTS "_ff_migrations" (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    // Datenbank, die zuvor per `prisma migrate` angelegt wurde: bereits angewendete Migrationen übernehmen
    const prisma = await client.query(`SELECT to_regclass('public._prisma_migrations') AS t`);
    if (prisma.rows[0].t) {
      await client.query(
        `INSERT INTO "_ff_migrations"(name) SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ON CONFLICT DO NOTHING`,
      );
    }
    const done = new Set((await client.query(`SELECT name FROM "_ff_migrations"`)).rows.map((r) => r.name));
    const names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    for (const name of names) {
      if (done.has(name)) continue;
      log(`Migration ${name} …`);
      await client.query("BEGIN");
      try {
        await client.query(fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8"));
        await client.query(`INSERT INTO "_ff_migrations"(name) VALUES ($1)`, [name]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
    await client.end();
  }
}

async function main() {
  try { fs.writeFileSync(LOG_FILE, ""); } catch { /* ignore */ }
  const has = (k: string) => (process.env[k] ? "gesetzt" : "FEHLT");
  log(`Start: Node ${process.version}, cwd=${process.cwd()}`);
  log(`Variablen: DATABASE_URL ${has("DATABASE_URL")}, APP_URL ${has("APP_URL")}, DISCORD_CLIENT_ID ${has("DISCORD_CLIENT_ID")}, DISCORD_CLIENT_SECRET ${has("DISCORD_CLIENT_SECRET")}, SUPERADMIN_DISCORD_IDS ${has("SUPERADMIN_DISCORD_IDS")}`);
  log("Schritt 1: Datenbank-Migrationen …");
  await migrate();
  log("Schritt 2: Standarddaten …");
  const db = new PrismaClient();
  try {
    await seedBase(db);
  } finally {
    await db.$disconnect();
  }
  log("Datenbank bereit. Schritt 3: Starte Server …");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./server.js");
}

main().catch((e) => {
  log(`START FEHLGESCHLAGEN: ${e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e)}`);
  process.exit(1);
});
