import type { AaoRequirement } from '../model/types';
import type { FactValue } from './questions';

/** Bausteine für Szenariodefinitionen (eigenes Modul, damit data/sh/* ohne Importzyklus darauf zugreifen kann) */
export const oneOf = (...v: FactValue[]) => ({ oneOf: v });
export const range = (a: number, b: number) => ({ range: [a, b] as [number, number] });
export const need = (capability: string, count = 1): AaoRequirement => ({ capability, count });
