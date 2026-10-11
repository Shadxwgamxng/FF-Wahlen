-- Technische Absicherung des Wahlgeheimnisses:
-- Bei geheimen Wahlen dürfen in "votes" weder ein Wähler noch ein Zeitstempel gespeichert werden.
-- Das gilt unabhängig von der Anwendungslogik auch für direkte DB-Zugriffe (INSERT/UPDATE).
CREATE OR REPLACE FUNCTION enforce_secret_ballot() RETURNS trigger AS $$
DECLARE
  is_secret boolean;
BEGIN
  SELECT secret INTO is_secret FROM elections WHERE id = NEW."electionId";
  IF is_secret AND (NEW."voterId" IS NOT NULL OR NEW."castAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Geheime Wahl: Stimmen dürfen keinem Wähler oder Zeitpunkt zugeordnet werden';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER votes_secret_ballot_guard
  BEFORE INSERT OR UPDATE ON "votes"
  FOR EACH ROW EXECUTE FUNCTION enforce_secret_ballot();

-- Die Wahlart darf nach dem Anlegen von Stimmen nicht mehr gewechselt werden.
CREATE OR REPLACE FUNCTION forbid_secret_flag_change() RETURNS trigger AS $$
BEGIN
  IF NEW.secret IS DISTINCT FROM OLD.secret
     AND EXISTS (SELECT 1 FROM votes WHERE "electionId" = OLD.id) THEN
    RAISE EXCEPTION 'Die Wahlart kann nach Stimmabgabe nicht mehr geändert werden';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER elections_secret_flag_guard
  BEFORE UPDATE ON "elections"
  FOR EACH ROW EXECUTE FUNCTION forbid_secret_flag_change();
