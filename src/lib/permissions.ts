export type PermissionDef = { key: string; label: string; group: string; description?: string };

/**
 * Katalog aller Berechtigungen. Wird beim Seed in die Tabelle `permissions` geschrieben.
 * Rollen und deren Rechte sind danach vollständig in der Datenbank verwaltbar.
 */
export const PERMISSIONS = [
  { key: "members.view", label: "Mitglieder ansehen", group: "Mitglieder" },
  { key: "members.manage", label: "Mitglieder anlegen & bearbeiten", group: "Mitglieder" },
  { key: "members.delete", label: "Mitglieder löschen", group: "Mitglieder" },
  { key: "members.discord", label: "Discord-Verknüpfungen verwalten", group: "Mitglieder" },
  { key: "units.view", label: "Löschzüge ansehen", group: "Löschzüge" },
  { key: "units.manage", label: "Löschzüge verwalten & Mitglieder zuordnen", group: "Löschzüge" },
  { key: "offices.view", label: "Ämter ansehen", group: "Ämter & Dienstgrade" },
  { key: "offices.manage", label: "Ämter verwalten", group: "Ämter & Dienstgrade" },
  { key: "ranks.manage", label: "Dienstgrade verwalten", group: "Ämter & Dienstgrade" },
  { key: "elections.view_all", label: "Alle Wahlen sehen (inkl. Entwürfe)", group: "Wahlen" },
  { key: "elections.manage", label: "Wahlen erstellen & bearbeiten", group: "Wahlen" },
  { key: "elections.control", label: "Wahlen starten, beenden & abbrechen", group: "Wahlen" },
  { key: "elections.delete", label: "Wahlen löschen", group: "Wahlen" },
  { key: "elections.results", label: "Ergebnisse jederzeit einsehen", group: "Wahlen" },
  { key: "elections.view_votes", label: "Einzelstimmen öffentlicher Wahlen einsehen", group: "Wahlen" },
  { key: "audit.view", label: "Audit-Log einsehen", group: "Administration" },
  { key: "users.manage", label: "Benutzer, Rollen & Berechtigungen verwalten", group: "Administration" },
  { key: "settings.manage", label: "Systemeinstellungen verwalten", group: "Administration" },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];

export const SUPERADMIN_ROLE_KEY = "SUPERADMIN";

/** Standardrollen (nur Seed-Vorbelegung; danach in der Oberfläche änderbar). */
export const DEFAULT_ROLES: {
  key: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}[] = [
  {
    key: SUPERADMIN_ROLE_KEY,
    name: "Superadministrator",
    description: "Vollzugriff auf die gesamte Anwendung",
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    key: "WEHRFUEHRER",
    name: "Wehrführer",
    description: "Verwaltet Mitglieder, Löschzüge, Ämter und Wahlen – ohne technische Systemadministration",
    permissions: [
      "members.view", "members.manage", "members.delete", "members.discord",
      "units.view", "units.manage",
      "offices.view", "offices.manage", "ranks.manage",
      "elections.view_all", "elections.manage", "elections.control", "elections.delete",
      "elections.results", "elections.view_votes",
      "audit.view",
    ],
  },
  {
    key: "WAHLLEITER",
    name: "Wahlleiter",
    description: "Bereitet Wahlen vor, startet und beendet sie",
    permissions: [
      "members.view", "units.view", "offices.view",
      "elections.view_all", "elections.manage", "elections.control",
      "elections.results", "elections.view_votes",
    ],
  },
  {
    key: "MITGLIED",
    name: "Feuerwehrmitglied",
    description: "Eigenes Profil, Wahlen ansehen und abstimmen",
    permissions: [],
  },
];
