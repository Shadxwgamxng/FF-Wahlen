import type { ScenarioDef } from '../scenarios';
import { SH_SCENARIOS_BRAND } from './scenarios_brand';
import { SH_SCENARIOS_TH } from './scenarios_th';
import { SH_SCENARIOS_RD } from './scenarios_rd';
import { SH_SCENARIOS_MISC } from './scenarios_misc';

/** Szenarien, die nur im Katalog Schleswig-Holstein vorkommen */
export const SH_SCENARIOS: ScenarioDef[] = [...SH_SCENARIOS_BRAND, ...SH_SCENARIOS_TH, ...SH_SCENARIOS_RD, ...SH_SCENARIOS_MISC];
