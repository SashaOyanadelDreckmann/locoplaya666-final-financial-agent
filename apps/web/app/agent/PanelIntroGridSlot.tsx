'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function PanelIntroGridSlot(props: {
  cardKey: string;
  syncLayout: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      layoutId={props.syncLayout ? `panel-intro-card-${props.cardKey}` : undefined}
      className="panel-intro-grid-slot"
      data-panel-intro-slot={props.cardKey}
      transition={{ type: 'spring', stiffness: 62, damping: 22, mass: 0.86 }}
    >
      {props.children}
    </motion.div>
  );
}
