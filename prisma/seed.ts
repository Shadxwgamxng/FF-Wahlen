import { PrismaClient } from "@prisma/client";
import { DEFAULT_ROLES, PERMISSIONS } from "../src/lib/permissions";

const db = new PrismaClient();

const UNITS = ["Löschzug 11", "Löschzug 21", "Löschzug 31"];
const OFFICES = [
  "Wehrführer", "Stellvertretender Wehrführer", "Zugführer", "Stellvertretender Zugführer",
  "Gruppenführer Gr. 1", "Gruppenführer Gr. 2", "Gerätewart 1", "Gerätewart 2", "Schriftführer",
];
const RANKS: [string, string][] = [
  ["Feuerwehrmann-Anwärter", "FMA"], ["Feuerwehrmann", "FM"], ["Oberfeuerwehrmann", "OFM"],
  ["Hauptfeuerwehrmann", "HFM"], ["Unterbrandmeister", "UBM"], ["Brandmeister", "BM"],
  ["Oberbrandmeister", "OBM"], ["Hauptbrandmeister", "HBM"], ["Brandinspektor", "BI"],
];

async function main() {
  // Berechtigungskatalog (idempotent)
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, group: p.group },
      create: { key: p.key, label: p.label, group: p.group },
    });
  }

  // Rollen: Rechte werden NUR bei der Erstanlage vorbelegt, damit spätere Änderungen erhalten bleiben.
  for (const r of DEFAULT_ROLES) {
    const existing = await db.role.findUnique({ where: { key: r.key } });
    if (existing) continue;
    await db.role.create({
      data: {
        key: r.key, name: r.name, description: r.description, isSystem: true,
        permissions: { create: r.permissions.map((permissionKey) => ({ permissionKey })) },
      },
    });
  }

  // Standard-Stammdaten nur beim allerersten Lauf – danach vollständig verwaltbar.
  if ((await db.fireUnit.count()) === 0)
    await db.fireUnit.createMany({ data: UNITS.map((name, i) => ({ name, sortOrder: i })) });
  if ((await db.office.count()) === 0)
    await db.office.createMany({ data: OFFICES.map((name, i) => ({ name, sortOrder: i })) });
  if ((await db.rank.count()) === 0)
    await db.rank.createMany({ data: RANKS.map(([name, abbreviation], i) => ({ name, abbreviation, sortOrder: i })) });
  await db.systemSetting.upsert({
    where: { key: "organization_name" }, update: {}, create: { key: "organization_name", value: "Freiwillige Feuerwehr" },
  });

  // Optional: Demo-Daten für lokale Entwicklung
  if (process.env.SEED_DEMO === "true" && (await db.firefighter.count()) === 0) {
    const units = await db.fireUnit.findMany({ orderBy: { sortOrder: "asc" } });
    const ranks = await db.rank.findMany();
    const names: [string, string, string, number][] = [
      ["Max", "Mustermann", "Florian Muster 11/01", 0], ["Peter", "Beispiel", "Florian Muster 21/01", 1],
      ["Anna", "Müller", "Florian Muster 31/01", 2], ["Hans", "Schmidt", "Florian Muster 11/02", 0],
      ["Lisa", "Wagner", "Florian Muster 21/02", 1], ["Tom", "Becker", "Florian Muster 31/02", 2],
    ];
    for (const [i, [firstName, lastName, callSign, u]] of names.entries()) {
      await db.firefighter.create({
        data: {
          firstName, lastName, displayName: `${firstName} ${lastName}`, callSign,
          rankId: ranks[(i + 1) % ranks.length].id,
          units: { create: [{ unitId: units[u].id, isPrimary: true }] },
        },
      });
    }
  }
  console.log("Seed abgeschlossen.");
}

main().finally(() => db.$disconnect());
