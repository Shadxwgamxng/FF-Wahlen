import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { devLoginEnabled, getCurrentUser } from "@/lib/auth";
import { Flash } from "@/components/ui";

const ERRORS: Record<string, string> = {
  unlinked: "Dein Discord-Account ist noch keinem Feuerwehrmitglied zugeordnet. Bitte wende dich an deinen Wehrführer.",
  disabled: "Dein Benutzerkonto wurde deaktiviert.",
  link_invalid: "Dieser Verknüpfungslink ist ungültig oder abgelaufen.",
  link_taken: "Dieses Feuerwehrmitglied ist bereits mit einem Discord-Account verknüpft.",
  state: "Die Anmeldung ist abgelaufen oder ungültig. Bitte versuche es erneut.",
  discord: "Die Anmeldung bei Discord ist fehlgeschlagen. Bitte versuche es erneut.",
  config: "Discord-Login ist nicht konfiguriert (DISCORD_CLIENT_ID fehlt).",
};

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <main className="relative grid min-h-screen place-items-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_0_48%,rgba(240,58,46,.06)_48%_52%,transparent_52%)] bg-[length:36px_36px] opacity-60" />
      <div className="card relative w-full max-w-md overflow-hidden animate-fadeUp">
        <div className="h-1 bg-gradient-to-r from-fire-600 via-fire-400 to-amber-400" />
        <div className="card-pad !p-8">
          <div className="mb-8 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wappen.png" alt="Wappen Freiwillige Feuerwehr Stadt Falkenwalde" className="h-20 w-20 object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,.6)]" />
            <div>
              <div className="text-lg font-bold leading-tight text-white">Wahlplattform</div>
              <div className="text-xs text-slate-400">Freiwillige Feuerwehr Stadt Falkenwalde</div>
            </div>
          </div>
          <Flash error={error ? (ERRORS[error] ?? "Anmeldung fehlgeschlagen.") : undefined} />
          <h1 className="text-2xl font-bold text-white">Willkommen</h1>
          <p className="mb-6 mt-1 text-sm text-slate-400">
            Melde dich mit deinem Discord-Account an. Dein Account muss zuvor von der Wehrführung einem Mitglied zugeordnet worden sein.
          </p>
          <a href="/api/auth/discord" className="btn-primary w-full !bg-[#5865F2] !from-[#5865F2] !to-[#4752c4] !shadow-none hover:!from-[#6b77f5]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5a18 18 0 0 0-6.4 0L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9 0 13.5.3 18a20 20 0 0 0 6 3l.9-1.4c-.5-.2-1-.4-1.4-.7l.3-.3a14 14 0 0 0 11.8 0l.3.3c-.5.3-.9.5-1.4.7l.9 1.4a20 20 0 0 0 6-3c.4-5.2-.7-9.700-3.4-13.600ZM8.5 15.300c-1.100 0-2-1-2-2.200s.9-2.200 2-2.200 2 1 2 2.200-.9 2.200-2 2.200Zm7 0c-1.100 0-2-1-2-2.200s.9-2.200 2-2.200 2 1 2 2.200-.9 2.200-2 2.200Z" /></svg>
            Mit Discord anmelden
          </a>
          <p className="mt-5 flex items-start gap-2 text-xs text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            Discord dient ausschließlich der Anmeldung. Es werden keine FiveM-, Steam- oder Rockstar-Daten verwendet.
          </p>

          {devLoginEnabled() && (
            <form action="/api/auth/dev" method="post" className="mt-8 space-y-2 border-t border-dashed border-amber-500/30 pt-5">
              <div className="card-title text-amber-400">Dev-Login (nur lokal)</div>
              <input name="discordId" className="input" placeholder="Discord-ID" required />
              <input name="username" className="input" placeholder="Discord-Name" />
              <button className="btn-ghost w-full">Entwickler-Login</button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
