import type { PanelDockTarget } from '@/components/ui/panel-cards-morph-intro';

import { PANEL_INTRO_CARD_ORDER } from './panel-cards-intro.copy';

/** Must match MobilePanelCircularDeck / CardStack stageOffsetX */
const MOBILE_DECK_STAGE_OFFSET_X = 132;

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

function readStageRect(stageEl: HTMLElement | null) {
  const stageRect = stageEl?.getBoundingClientRect();
  const width = stageRect?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 390);
  const left = stageRect?.left ?? 0;
  const bottom = stageRect?.bottom ?? (typeof window !== 'undefined' ? window.innerHeight * 0.92 : 700);
  const centerX = left + width / 2 + MOBILE_DECK_STAGE_OFFSET_X;
  return { centerX, bottom, width };
}

export type MobileSpotlightLayoutInput = {
  viewportWidth: number;
  viewportHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  phase: 'enter' | 'spotlight';
  handoffOrigin?: { x: number; y: number } | null;
};

/** Centered spotlight card on mobile — independent of deck offset */
export function getMobileSpotlightLayout(input: MobileSpotlightLayoutInput) {
  const padX = 20;
  const headerReserve = 128;
  const footerReserve = 88;
  const availW = input.viewportWidth - padX * 2;
  const availH = input.viewportHeight - headerReserve - footerReserve;
  const aspect = input.naturalWidth / Math.max(input.naturalHeight, 1);

  let cardW = Math.min(input.naturalWidth * 1.06, availW, 360);
  let cardH = Math.round(cardW / aspect);

  if (cardH > availH) {
    cardH = availH;
    cardW = Math.round(cardH * aspect);
  }

  if (input.phase === 'enter' && input.handoffOrigin) {
    const enterW = cardW * 0.92;
    const enterH = Math.round(enterW / aspect);
    return {
      left: input.handoffOrigin.x - enterW / 2,
      top: input.handoffOrigin.y - enterH / 2,
      width: enterW,
      height: enterH,
    };
  }

  return {
    left: (input.viewportWidth - cardW) / 2,
    top: headerReserve + Math.max(0, (availH - cardH) / 2),
    width: cardW,
    height: cardH,
  };
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

  const { centerX, bottom: bottomY } = readStageRect(stageEl);

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
  return PANEL_INTRO_CARD_ORDER.map((card, index) => {
    const live = readLiveDeckCardTarget(stageEl, card.key);
    return live ?? computeMobileDeckDockTargetAtIndex(stageEl, index);
  });
}
