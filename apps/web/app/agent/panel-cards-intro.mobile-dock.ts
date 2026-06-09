import type { PanelDockTarget } from '@/components/ui/panel-cards-morph-intro';

import { PANEL_INTRO_CARD_ORDER } from './panel-cards-intro.copy';

function signedOffset(i: number, active: number, len: number) {
  const raw = i - active;
  if (len <= 1) return raw;
  const alt = raw > 0 ? raw - len : raw + len;
  return Math.abs(alt) < Math.abs(raw) ? alt : raw;
}

function mobileDeckCardSize() {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  const cardW = Math.round(Math.min(180, Math.max(130, vw * 0.39)));
  const cardH = Math.round(Math.min(83, Math.max(64, cardW * 0.44)));
  return { cardW, cardH };
}

export function computeMobileDeckDockTargets(
  stageEl: HTMLElement | null,
): PanelDockTarget[] {
  const { cardW, cardH } = mobileDeckCardSize();
  const cardCount = PANEL_INTRO_CARD_ORDER.length;

  const overlap = 0.48;
  const spreadDeg = 20;
  const maxVisible = 5;
  const maxOffset = Math.max(0, Math.floor(maxVisible / 2));
  const cardSpacing = Math.max(10, Math.round(cardW * (1 - overlap)));
  const stepDeg = maxOffset > 0 ? spreadDeg / maxOffset : 0;
  const stageOffsetX = 132;
  const activeScale = 1.015;
  const inactiveScale = 0.88;
  const activeLiftPx = 8;

  const stageRect = stageEl?.getBoundingClientRect();
  const centerX =
    (stageRect?.left ?? window.innerWidth / 2) +
    (stageRect?.width ?? window.innerWidth) / 2 +
    stageOffsetX;
  const bottomY = stageRect?.bottom ?? window.innerHeight * 0.92;

  return PANEL_INTRO_CARD_ORDER.map((_, index) => {
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
  });
}
