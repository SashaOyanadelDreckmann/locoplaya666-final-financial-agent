export type UIEvent =
  | { type: 'OPEN_ARTIFACT'; payload: { id: string } }
  | { type: 'SAVE_ARTIFACT'; payload: { id: string } }
  | { type: 'ANIMATE_TRANSFER'; payload: { from: string; to: string } }
  | { type: 'PANEL_OPEN'; payload: { panel: string } }
  | { type: 'PLAN_SET'; payload: { planId: string } }
  | { type: 'PLAN_PROGRESS'; payload: { progress: number } };
