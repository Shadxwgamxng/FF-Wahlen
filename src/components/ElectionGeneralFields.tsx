import { EyeOff, Eye } from "lucide-react";

type Defaults = { name?: string; description?: string | null; startsAt: string; endsAt: string; type: "secret" | "public"; resultsPublic: boolean };

export function ElectionGeneralFields({ defaults, disabled }: { defaults: Defaults; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="space-y-5 disabled:opacity-70">
      <div>
        <label className="label" htmlFor="name">Name der Wahl</label>
        <input id="name" name="name" className="input" required minLength={3} maxLength={120} defaultValue={defaults.name} placeholder="Feuerwehr-Vorstandswahl 2026" />
      </div>
      <div>
        <label className="label" htmlFor="description">Beschreibung</label>
        <textarea id="description" name="description" className="input" maxLength={4000} defaultValue={defaults.description ?? ""} placeholder="Worum geht es bei dieser Wahl?" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="startsAt">Start (Datum & Uhrzeit)</label>
          <input id="startsAt" type="datetime-local" name="startsAt" className="input" required defaultValue={defaults.startsAt} />
        </div>
        <div>
          <label className="label" htmlFor="endsAt">Ende (Datum & Uhrzeit)</label>
          <input id="endsAt" type="datetime-local" name="endsAt" className="input" required defaultValue={defaults.endsAt} />
        </div>
      </div>
      <div>
        <div className="label">Art der Wahl</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="relative cursor-pointer">
            <input type="radio" name="type" value="secret" defaultChecked={defaults.type === "secret"} className="peer sr-only" />
            <div className="rounded-xl border border-white/10 p-4 transition peer-checked:border-amber-500/60 peer-checked:bg-amber-500/10">
              <div className="flex items-center gap-2 font-semibold text-white"><EyeOff className="h-4 w-4 text-amber-400" /> Geheime Wahl</div>
              <p className="mt-1 text-xs text-slate-400">Es wird nur gespeichert, <i>dass</i> jemand abgestimmt hat – niemals <i>wie</i>. Technisch nicht rückverfolgbar.</p>
            </div>
          </label>
          <label className="relative cursor-pointer">
            <input type="radio" name="type" value="public" defaultChecked={defaults.type === "public"} className="peer sr-only" />
            <div className="rounded-xl border border-white/10 p-4 transition peer-checked:border-blue-500/60 peer-checked:bg-blue-500/10">
              <div className="flex items-center gap-2 font-semibold text-white"><Eye className="h-4 w-4 text-blue-400" /> Öffentliche Wahl</div>
              <p className="mt-1 text-xs text-slate-400">Berechtigte Administratoren sehen, wer wann für wen gestimmt hat.</p>
            </div>
          </label>
        </div>
      </div>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-slate-300">
        <input type="checkbox" name="resultsPublic" defaultChecked={defaults.resultsPublic} className="h-5 w-5 accent-[#f03a2e]" />
        Ergebnis nach Ende für alle Mitglieder sichtbar
      </label>
    </fieldset>
  );
}
