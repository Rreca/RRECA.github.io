import { registerPlugin } from '@capacitor/core';

export interface TimerPluginStartOptions {
  seconds: number;
  title?: string;
}

export interface TimerFinishedEvent {
  elapsedSeconds: number;
  title: string;
}

export interface TimerCancelledEvent {
  remainingSeconds: number;
}

export interface TimerStateResult {
  running: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  title: string;
}

export interface PendingFocusResult {
  pending: boolean;
  knotId: string;
}

export interface OpenFocusEvent {
  knotId: string;
}

export interface TimerPluginInterface {
  start(options: TimerPluginStartOptions): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<TimerStateResult>;
  consumePendingFocus(): Promise<PendingFocusResult>;
  addListener(
    eventName: 'timerFinished',
    callback: (event: TimerFinishedEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'timerCancelled',
    callback: (event: TimerCancelledEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'openFocus',
    callback: (event: OpenFocusEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const TimerPlugin = registerPlugin<TimerPluginInterface>('TimerPlugin');
export default TimerPlugin;
