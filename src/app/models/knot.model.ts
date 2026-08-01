export type KnotStatus = 'BLOCKED' | 'UNLOCKABLE' | 'DOING' | 'DONE' | 'SOMEDAY' | 'ARCHIVED';
export type BlockReason = 'NO_START' | 'LAZINESS' | 'FEAR' | 'EXTERNAL' | 'NOT_TODAY';
export type KnotContext = 'ANY' | 'HOME' | 'STREET' | 'WORK';
export type ContextFilter = 'ALL' | 'HOME' | 'STREET' | 'WORK' | 'ANY';
export type ArchiveReason = 'SPLIT' | 'DONE_MERGE' | 'MANUAL' | 'CLEANUP' | 'OTHER';
export type RecurrenceType = 'daily' | 'weekly' | null;

export interface Knot {
  id: string;
  title: string;
  status: KnotStatus;
  blockReason: BlockReason;
  context: KnotContext;
  contextSource?: 'AUTO' | 'MANUAL';
  weight: number;       // fricción 1–5
  impact: number;       // impacto 1–5
  nextStep?: string | null;
  estMinutes?: number | null;
  externalWait?: string | null;
  createdAt: number;
  updatedAt: number;
  lastTouchedAt: number;
  doneAt?: number | null;
  archivedAt?: number | null;
  archiveReason?: ArchiveReason | null;
  parentId?: string | null;  // id del nudo del que fue dividido (SPLIT)
  chainId?: string | null;       // references Chain.id
  chainOrder?: number | null;    // 0-based position within chain
  recurrence?: RecurrenceType;   // null = one-time, 'daily' or 'weekly'
  nextRecurrenceAt?: number | null;  // timestamp when it should reappear as UNLOCKABLE
  notes?: string[];  // mini-log de avances
}

export type KnotPatch = Partial<Knot> & { id: string };
