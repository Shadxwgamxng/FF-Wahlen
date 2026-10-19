import type { GameState } from '../model/types';
import * as E from '../sim/engine';
import { radioCall, radioTalk } from '../sim/funk';
import type { CommandResult } from '../sim/engine';

/**
 * Benannte, serialisierbare Spielbefehle. Die Oberfläche ruft Befehle über ihren Namen auf
 * (store.cmd), damit sie auch aus weiteren Browserfenstern (zweiter Bildschirm) an das
 * Hauptfenster übertragen werden können. Gleiches Muster ist für einen späteren Mehrspieler-Server vorgesehen.
 */
export const COMMANDS = {
  acceptCall: E.acceptCall,
  acknowledgeRadio: E.acknowledgeRadio,
  alarmVehicles: E.alarmVehicles,
  alarmGroups: E.alarmGroups,
  setCallDias: E.setCallDias,
  applyDiasResult: E.applyDiasResult,
  applyLocate: E.applyLocate,
  applyRoutes: E.applyRoutes,
  askQuestion: E.askQuestion,
  assignHospital: E.assignHospital,
  changeIncidentKeyword: E.changeIncidentKeyword,
  closeCallWithoutIncident: E.closeCallWithoutIncident,
  closeIncident: E.closeIncident,
  correctIncidentLocation: E.correctIncidentLocation,
  createIncidentFromCall: E.createIncidentFromCall,
  createManualIncident: E.createManualIncident,
  injectScenarioCall: E.injectScenarioCall,
  linkCallToIncident: E.linkCallToIncident,
  radioCall,
  radioTalk,
  releaseAllOnScene: E.releaseAllOnScene,
  releaseVehicle: E.releaseVehicle,
  requestBackup: E.requestBackup,
  restartSimulation: E.restartSimulation,
  setCallKeyword: E.setCallKeyword,
  setCallMeldebild: E.setCallMeldebild,
  forwardCall: E.forwardCall,
  setRunning: E.setRunning,
  setSpeed: E.setSpeed,
  setVehicleServiceStatus: E.setVehicleServiceStatus,
  startLocating: E.startLocating,
  updateCallMask: E.updateCallMask,
  voiceTurn: E.voiceTurn,
  toggleRunning: (s: GameState): CommandResult => E.setRunning(s, !s.runtime.clock.running),
} satisfies Record<string, (s: GameState, ...args: never[]) => CommandResult>;

export type CommandName = keyof typeof COMMANDS;
type Fn = (typeof COMMANDS)[CommandName];
export type CommandArgs<K extends CommandName> = (typeof COMMANDS)[K] extends (s: GameState, ...a: infer A) => CommandResult ? A : never;

export function execCommand(state: GameState, name: CommandName, args: unknown[]): CommandResult {
  const fn = COMMANDS[name] as Fn | undefined;
  if (!fn) return { ok: false, error: `Unbekannter Befehl ${name}` };
  return (fn as (s: GameState, ...a: unknown[]) => CommandResult)(state, ...args);
}
