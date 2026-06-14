'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

import type { PanelIntroPhase } from './panel-intro.types';

const ASSEMBLE_SPRING = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 34,
  mass: 0.76,
};

export function PanelIntroGridSlot(props: {
  cardKey: string;
  cardIndex: number;
  introPhase: PanelIntroPhase;
  revealedCount: number;
  syncLayout: boolean;
  children: ReactNode;
}) {
  const revealed =
    props.introPhase === 'assemble' || props.introPhase === 'settle'
      ? props.cardIndex < props.revealedCount
      : false;

  const shareLayout =
    props.syncLayout && (props.introPhase === 'assemble' || props.introPhase === 'settle') && revealed;

  return (
    <motion.div
      layoutId={shareLayout ? `panel-intro-card-${props.cardKey}` : undefined}
      className="panel-intro-grid-slot"
      data-panel-intro-slot={props.cardKey}
      data-panel-intro-index={props.cardIndex}
      initial={false}
      animate={
        revealed
          ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }
          : { opacity: 0, y: 14, scale: 0.93, filter: 'blur(8px)' }
      }
      transition={ASSEMBLE_SPRING}
    >
      {props.children}
    </motion.div>
  );
}
