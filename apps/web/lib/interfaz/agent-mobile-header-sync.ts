/** Measure the fixed mobile chat header and reserve exact space for thread content. */

import { shouldUseMobileShell } from '@/lib/interfaz/viewport-mode';

export const AGENT_MOBILE_HEADER_MEASURED_H_VAR = '--agent-mobile-header-measured-h';

export function measureAgentMobileHeaderHeight(header: HTMLElement): number {
  return Math.ceil(Math.max(header.getBoundingClientRect().height, header.scrollHeight, header.offsetHeight));
}

export function clearAgentMobileHeaderOccupy(root: HTMLElement = document.documentElement): void {
  root.style.removeProperty(AGENT_MOBILE_HEADER_MEASURED_H_VAR);
}

export function syncAgentMobileHeaderOccupy(
  header: HTMLElement | null,
  root: HTMLElement = document.documentElement,
): void {
  if (typeof window === 'undefined') return;

  if (!header || !shouldUseMobileShell() || !header.classList.contains('is-mobile')) {
    clearAgentMobileHeaderOccupy(root);
    return;
  }

  const height = measureAgentMobileHeaderHeight(header);
  if (height > 0) {
    root.style.setProperty(AGENT_MOBILE_HEADER_MEASURED_H_VAR, `${height}px`);
    return;
  }

  clearAgentMobileHeaderOccupy(root);
}

export function observeAgentMobileHeaderOccupy(
  header: HTMLElement,
  root: HTMLElement = document.documentElement,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const run = () => syncAgentMobileHeaderOccupy(header, root);

  run();

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          run();
        })
      : null;
  resizeObserver?.observe(header);

  const mutationObserver =
    typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => {
          run();
        })
      : null;
  mutationObserver?.observe(header, {
    attributes: true,
    attributeFilter: ['class', 'style'],
    childList: true,
    subtree: true,
  });

  window.addEventListener('resize', run);
  window.requestAnimationFrame(run);

  return () => {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    window.removeEventListener('resize', run);
    clearAgentMobileHeaderOccupy(root);
  };
}
