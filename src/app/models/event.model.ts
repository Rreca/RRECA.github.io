export type EventType =
  | 'KNOT_CREATED'
  | 'KNOT_UPDATED'
  | 'KNOT_DELETED'
  | 'KNOT_DONE'
  | 'KNOT_ARCHIVED'
  | 'KNOT_RESTORED'
  | 'STATUS_CHANGED'
  | 'DONE_CLEANUP'
  | 'TIMER_5MIN_START'
  | 'TIMER_5MIN_STOP'
  | 'QUICK_EDIT'
  | 'CONTEXT_MIGRATED'
  | 'GOAL_CLOSE_ONE_CLICK'
  | 'GOAL_CLOSE_PICKED_FROM_NAV'
  | 'GOAL_SWITCHED'
  | 'NUDGE_SHOWN'
  | 'RESET_ALL_DATA'
  | 'CAPTURE_BLOCKED_SYSTEM_FULL'
  | 'CHAIN_CREATED'
  | 'CHAIN_DELETED'
  | 'KNOT_ADDED_TO_CHAIN'
  | 'KNOT_REMOVED_FROM_CHAIN'
  | 'CHAIN_REORDERED';

export interface AppEvent {
  id: string;
  knotId: string | null;
  type: EventType;
  meta: Record<string, unknown>;
  createdAt: number;
}
