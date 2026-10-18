import type { DetailTopic } from './types';
import { p, w, zahl } from './types';

/** Gebäude, Zugang, Brandumfeld */
export const BUILDING_TOPICS: DetailTopic[] = [
  {
    id: 'x_etagen',
    label: 'Anzahl der Etagen',
    patterns: [p(' wie ?viele (etagen|stockwerke|stockwerk|geschosse|stock) '), p(' wie hoch ist (das|der) (haus|gebaeude|block)'), p(' (etagen|stockwerke|geschosse) hat ')],
    examples: ['Wie viele Etagen hat das Gebäude?', 'wie viele stockwerke hat das haus', 'Wie hoch ist das Haus?', 'wieviele geschosse hat der block'],
    applies: (c) => c.building !== null,
    generate: (c) => c.rng.int(c.building!.minFloors, c.building!.maxFloors),
    answer: (v, c) => {
      const n = Number(v);
      if (n <= 1) return `Das ist ein flaches ${c.building!.label === 'Einfamilienhaus' ? 'Haus, nur Erdgeschoss' : 'Gebäude, nur Erdgeschoss'}.`;
      return `Das Haus hat ${zahl(n)} Etagen, also Erdgeschoss und ${zahl(n - 1)} ${n - 1 === 1 ? 'Obergeschoss' : 'Obergeschosse'}.`;
    },
    unknown: () => 'Hier ist kein Gebäude, das ist im Freien.',
  },
];

void w;
