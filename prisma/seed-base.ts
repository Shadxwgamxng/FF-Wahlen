import type { PrismaClient } from "@prisma/client";
import { DEFAULT_ROLES, PERMISSIONS } from "../src/lib/permissions";

const UNITS = ["Löschzug 11", "Löschzug 21", "Löschzug 31"];
const OFFICES = [
  "Wehrführer", "Stellvertretender Wehrführer", "Zugführer", "Stellvertretender Zugführer",
  "Gruppenführer Gr. 1", "Gruppenführer Gr. 2", "Gerätewart 1", "Gerätewart 2", "Schriftführer",
];
// Aufsteigend nach Rang: Mannschaft → Brandmeister → Führungsdienstgrade
const RANKS: [string, string][] = [
  ["Feuerwehrmannanwärter/in", "FMA"], ["Feuerwehrmann/-frau", "FM"], ["Oberfeuerwehrmann/-frau", "OFM"],
  ["Hauptfeuerwehrmann/-frau", "HFM"], ["Erster Hauptfeuerwehrmann/-frau", "EHFM"],
  ["Brandmeister/in", "BM"], ["Oberbrandmeister/in", "OBM"], ["Hauptbrandmeister/in", "HBM"],
  ["Erster Hauptbrandmeister/in", "EHBM"],
  ["Brandinspektor/in", "BI"], ["Oberbrandinspektor/in", "OBI"], ["Hauptbrandinspektor/in", "HBI"],
  ["Erster Hauptbrandinspektor/in", "EHBI"], ["Gemeindebrandinspektor/in", "GBI"],
  ["Abschnittsbrandinspektor/in", "ABI"], ["Erster Abschnittsbrandinspektor/in", "EABI"],
  ["Kreisbrandinspektor/in", "KBI"], ["Erster Kreisbrandinspektor/in", "EKBI"],
];

/** Legt Berechtigungen, Rollen und Standard-Stammdaten an (idempotent, KEINE Demodaten). */
export async function seedBase(db: PrismaClient) {
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
    where: { key: "organization_name" }, update: {}, create: { key: "organization_name", value: "FF Stadt Falkenwalde" },
  });

}
