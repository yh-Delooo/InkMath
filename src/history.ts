export type FormulaRecord = {id: string; latex: string; hash: string; path: string; created: number};
export function newestFirst(records: FormulaRecord[]): FormulaRecord[] {
  return [...records].sort((a, b) => (Number.isFinite(b.created) ? b.created : 0) - (Number.isFinite(a.created) ? a.created : 0));
}
