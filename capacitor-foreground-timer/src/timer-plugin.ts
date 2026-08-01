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

export interface TimerPluginInterface {
  start(options: TimerPluginStartOptions): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'timerFinished',
    callback: (event: TimerFinishedEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'timerCancelled',
    callback: (event: TimerCancelledEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const TimerPlugin = registerPlugin<TimerPluginInterface>('TimerPlugin');
export default TimerPlugin;
