import type { PanelDockTarget } from '@/components/ui/panel-cards-morph-intro';

import { PANEL_INTRO_CARD_ORDER } from './panel-cards-intro.copy';

function signedOffset(i: number, active: number, len: number) {
  const raw = i - active;
  if (len <= 1) return raw;
  const alt = raw > 0 ? raw - len : raw + len;
  return Math.abs(alt) < Math.abs(raw) ? alt : raw;
}

export function getMobileDeckCardNaturalSize() {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  const cardW = Math.round(Math.min(180, Math.max(130, vw * 0.39)));
  const cardH = Math.round(Math.min(83, Math.max(64, cardW * 0.44)));
  return { width: cardW, height: cardH };
}

function computeMobileDeckDockTargetAtIndex(
  stageEl: HTMLElement | null,
  index: number,
): PanelDockTarget {
  const { width: cardW, height: cardH } = getMobileDeckCardNaturalSize();
  const cardCount = PANEL_INTRO_CARD_ORDER.length;

  const overlap = 0.48;
  const spreadDeg = 20;
  const maxVisible = 5;
  const maxOffset = Math.max(0, Math.floor(maxVisible / 2));
  const cardSpacing = Math.max(10, Math.round(cardW * (1 - overlap)));
  const stepDeg = maxOffset > 0 ? spreadDeg / maxOffset : 0;
  const activeScale = 1.015;
  const inactiveScale = 0.88;
  const activeLiftPx = 8;

  const stageRect = stageEl?.getBoundingClientRect();
  const centerX = (stageRect?.left ?? 0) + (stageRect?.width ?? window.innerWidth) / 2;
  const bottomY = stageRect?.bottom ?? window.innerHeight * 0.92;

  let off = signedOffset(index, 0, cardCount);
  if (Math.abs(off) > maxOffset) {
    off = off > 0 ? maxOffset : -maxOffset;
  }

  const abs = Math.abs(off);
  const isActive = off === 0;
  const x = off * cardSpacing;
  const y = abs * 10 + (isActive ? -activeLiftPx : 0);
  const scale = isActive ? activeScale : inactiveScale;
  const width = cardW * scale;
  const height = cardH * scale;
  const left = centerX + x - width / 2;
  const top = bottomY - height + y;

  return {
    x: left,
    y: top,
    width,
    height,
    rotation: off * stepDeg,
  };
}

function readLiveDeckCardTarget(
  stageEl: HTMLElement | null,
  cardKey: string,
): PanelDockTarget | null {
  if (!stageEl) return null;

  const shell =
    stageEl.querySelector<HTMLElement>(`[data-panel-card-key="${cardKey}"]`) ??
    stageEl.querySelector<HTMLElement>(`[data-panel-intro-slot="${cardKey}"]`);

  if (!shell) return null;

  const motionHost =
    shell.closest<HTMLElement>('[style*="transform"]') ??
    shell.parentElement ??
    shell;

  const rect = (motionHost ?? shell).getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;

  let rotation = 0;
  try {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(motionHost ?? shell).transform);
    rotation = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
  } catch {
    rotation = 0;
  }

  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    rotation: Number.isFinite(rotation) ? rotation : 0,
  };
}

export function computeMobileDeckDockTargets(
  stageEl: HTMLElement | null,
): PanelDockTarget[] {
  const computed = PANEL_INTRO_CARD_ORDER.map((card, index) => {
    const live = readLiveDeckCardTarget(stageEl, card.key);
    return live ?? computeMobileDeckDockTargetAtIndex(stageEl, index);
  });

  return computed;
}
