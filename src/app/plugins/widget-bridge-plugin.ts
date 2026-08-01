import { registerPlugin } from '@capacitor/core';

export interface WidgetData {
  currentKnot: { id: string; title: string; estMinutes: number | null; nextStep: string | null } | null;
  nextUnlockable: { id: string; title: string } | null;
  doneTodayCount: number;
  dailyGoal: number;
}

export interface WidgetBridgePluginInterface {
  updateWidgetData(data: WidgetData): Promise<void>;
}

const WidgetBridgePlugin = registerPlugin<WidgetBridgePluginInterface>('WidgetBridgePlugin');
export default WidgetBridgePlugin;
