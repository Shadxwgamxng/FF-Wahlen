import type { GameState } from '../model/types';
import * as E from '../sim/engine';
import { radioCall, radioTalk } from '../sim/funk';
import { policeAnswer, policeCallClose, policeCallOpen, policeShare, policeTalk } from '../sim/polizei';
import type { CommandResult } from '../sim/engine';
import { getActor } from '../sim/actor';

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
  policeCallOpen,
  policeAnswer,
  policeCallClose,
  policeShare,
  policeTalk,
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
  takeOver: E.takeOver,
  answerTakeOver: E.answerTakeOver,
  cancelTakeOver: E.cancelTakeOver,
  playerSeen: E.playerSeen,
  voiceTurn: E.voiceTurn,
  toggleRunning: (s: GameState): CommandResult => E.setRunning(s, !s.runtime.clock.running),
} satisfies Record<string, (s: GameState, ...args: never[]) => CommandResult>;

export type CommandName = keyof typeof COMMANDS;
type Fn = (typeof COMMANDS)[CommandName];
export type CommandArgs<K extends CommandName> = (typeof COMMANDS)[K] extends (s: GameState, ...a: infer A) => CommandResult ? A : never;

/** Befehle, deren erstes Argument ein Notruf bzw. ein Einsatz ist (Zuständigkeit im Mehrspieler) */
const CALL_CMDS = new Set<string>(['askQuestion', 'setCallKeyword', 'setCallMeldebild', 'createIncidentFromCall', 'updateCallMask', 'closeCallWithoutIncident', 'forwardCall', 'linkCallToIncident', 'startLocating', 'applyLocate', 'setCallDias', 'applyDiasResult', 'voiceTurn']);
const INC_CMDS = new Set<string>(['alarmVehicles', 'alarmGroups', 'releaseAllOnScene', 'closeIncident', 'requestBackup', 'changeIncidentKeyword', 'correctIncidentLocation', 'policeCallOpen', 'policeAnswer', 'policeCallClose', 'policeShare', 'policeTalk']);
/** Zeit, Neustart und Übungsszenarien steuert nur der Gastgeber */
const HOST_ONLY = new Set<string>(['toggleRunning', 'setRunning', 'setSpeed', 'restartSimulation', 'injectScenarioCall']);

function guard(state: GameState, name: string, args: unknown[]): string | null {
  const who = getActor();
  if (!who) return null;
  if (!who.host && HOST_ONLY.has(name)) return 'Das darf nur der Gastgeber.';
  const id = typeof args[0] === 'string' ? args[0] : null;
  if (!id) return null;
  const owner = CALL_CMDS.has(name) ? state.runtime.calls.find((c) => c.id === id)?.owner : INC_CMDS.has(name) ? state.runtime.incidents.find((i) => i.id === id)?.owner : undefined;
  if (owner && owner.id !== who.id) return `Wird von ${owner.name} bearbeitet – zuerst „Übernahme anfragen“.`;
  return null;
}

export function execCommand(state: GameState, name: CommandName, args: unknown[]): CommandResult {
  const fn = COMMANDS[name] as Fn | undefined;
  if (!fn) return { ok: false, error: `Unbekannter Befehl ${name}` };
  const blocked = guard(state, name, args);
  if (blocked) return { ok: false, error: blocked };
  return (fn as (s: GameState, ...a: unknown[]) => CommandResult)(state, ...args);
}
