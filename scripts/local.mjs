// Ein-Klick-Start: eingebettete PostgreSQL-Datenbank + Migration + Demodaten + App + Browser.
// Gestartet über Start.bat (Windows) / Start.command (macOS) / start.sh (Linux).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const PG_PORT = 54329;
const APP_PORT = 3000;
const dataDir = path.join(root, ".data");
const pgDir = path.join(dataDir, "postgres");
const log = (m) => console.log(`\n▶ ${m}`);
const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env }, shell: isWin });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} fehlgeschlagen`);
}

mkdirSync(dataDir, { recursive: true });

// Läuft die Plattform schon? Dann nur den Browser öffnen.
try {
  if ((await fetch(`http://localhost:${APP_PORT}/login`)).ok) {
    console.log(`Die Wahlplattform läuft bereits auf http://localhost:${APP_PORT}`);
    const u = `http://localhost:${APP_PORT}`;
    const [c, a] = isWin ? ["cmd", ["/c", "start", "", u]] : [process.platform === "darwin" ? "open" : "xdg-open", [u]];
    const o = spawn(c, a, { stdio: "ignore", detached: true });
    o.on("error", () => {});
    o.unref();
    process.exit(0);
  }
} catch {}

// 1) Konfiguration beim ersten Start automatisch anlegen
if (!existsSync(".env")) {
  log("Erstelle Konfiguration (.env)");
  writeFileSync(
    ".env",
    [
      `DATABASE_URL="postgresql://postgres:postgres@localhost:${PG_PORT}/ff_wahlen?schema=public"`,
      `APP_URL="http://localhost:${APP_PORT}"`,
      `DISCORD_CLIENT_ID=""`,
      `DISCORD_CLIENT_SECRET=""`,
      `SUPERADMIN_DISCORD_IDS="100000000000000001"`,
      `CRON_SECRET=""`,
      `DEV_LOGIN="true"`,
      "",
    ].join("\n"),
  );
}
const dbUrl = readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
const usesEmbedded = dbUrl?.includes(`:${PG_PORT}/`);

// 2) Eingebettete Datenbank starten
let pg = null;
if (usesEmbedded) {
  log("Starte Datenbank …");
  pg = new EmbeddedPostgres({ databaseDir: pgDir, user: "postgres", password: "postgres", port: PG_PORT, persistent: true });
  const fresh = !existsSync(path.join(pgDir, "PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase("ff_wahlen");
}

const stopAll = async (code = 0) => {
  try { if (pg) await pg.stop(); } catch {}
  process.exit(code);
};

try {
  // 3) Schema, Rechte, Standarddaten
  log("Richte Datenbank ein …");
  run(npx, ["prisma", "generate"]);
  run(npx, ["prisma", "migrate", "deploy"]);
  const firstRun = !existsSync(path.join(dataDir, ".seeded"));
  run(npx, ["tsx", "prisma/seed.ts"], firstRun ? { SEED_DEMO: "true" } : {});
  if (firstRun) writeFileSync(path.join(dataDir, ".seeded"), new Date().toISOString());

  // 4) App starten
  log(`Starte Wahlplattform auf http://localhost:${APP_PORT}`);
  const app = spawn(npx, ["next", "dev", "-p", String(APP_PORT)], { stdio: "inherit", shell: isWin });
  app.on("exit", (c) => stopAll(c ?? 0));
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { app.kill(); stopAll(0); });

  // 5) Browser öffnen, sobald die Seite antwortet
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://localhost:${APP_PORT}/login`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  const url = `http://localhost:${APP_PORT}`;
  const [cmd, args] = isWin ? ["cmd", ["/c", "start", "", url]] : [process.platform === "darwin" ? "open" : "xdg-open", [url]];
  const opener = spawn(cmd, args, { stdio: "ignore", detached: true });
  opener.on("error", () => {}); // kein Browser-Opener vorhanden: URL steht in der Ausgabe
  opener.unref();
  console.log(`\n✔ Läuft: ${url}\n  Anmelden: Dev-Login mit Discord-ID 100000000000000001 (Superadmin)\n  Beenden: dieses Fenster schließen oder Strg+C`);
} catch (e) {
  console.error("\n✖ Fehler:", e.message);
  await stopAll(1);
}
