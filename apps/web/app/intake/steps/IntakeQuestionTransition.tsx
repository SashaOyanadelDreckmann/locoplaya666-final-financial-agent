'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

type IntakeQuestionTransitionProps = {
  questionKey: string | number;
  children: ReactNode;
};

export function IntakeQuestionTransition({ questionKey, children }: IntakeQuestionTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={questionKey}
        className="intake-question-block intake-question-screen"
        initial={{ opacity: 0, rotateX: 7, y: 22, scale: 0.985, filter: 'blur(8px)' }}
        animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, rotateX: -4, y: -16, scale: 0.99, filter: 'blur(8px)' }}
        transition={{ duration: 0.42, ease: [0.22, 0.68, 0, 1.14] }}
        style={{ transformPerspective: 900, transformOrigin: 'center bottom' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
