import type { UIEvent } from './types/chat';

export function dispatchUIEvent(event: UIEvent) {
  switch (event.type) {
    case 'TOAST':
      return;

    case 'FOCUS_ARTIFACT':
    case 'OPEN_ARTIFACT':
    case 'SAVE_ARTIFACT':
    case 'ANIMATE_TRANSFER':
      // hooks futuros
      return;

    default:
      return;
  }
}
