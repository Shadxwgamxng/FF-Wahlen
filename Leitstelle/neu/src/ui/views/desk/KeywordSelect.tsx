import type { GameState, KeywordCategory } from '../../../model/types';
import { CATEGORY_LABELS } from '../../../data/keywords';

export function KeywordSelect({ game, value, onChange, id }: { game: GameState; value: string | null; onChange: (id: string | null) => void; id?: string }) {
  const groups = new Map<KeywordCategory, typeof game.center.keywords>();
  for (const k of game.center.keywords) groups.set(k.category, [...(groups.get(k.category) ?? []), k]);
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Einsatzstichwort" data-testid="keyword-select">
      <option value="">– Stichwort wählen –</option>
      {[...groups.entries()].map(([cat, kws]) => (
        <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
          {kws.map((k) => (
            <option key={k.id} value={k.id}>
              {k.code} – {k.label} (P{k.priority})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
