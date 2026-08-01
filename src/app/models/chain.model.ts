export interface Chain {
  id: string;          // UUID (same format as Knot.id)
  name: string;        // 1–100 chars
  createdAt: number;   // Unix timestamp ms
}
