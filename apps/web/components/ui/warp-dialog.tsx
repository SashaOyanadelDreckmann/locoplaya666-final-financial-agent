'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type WarpDialogContextType = {
  open: boolean;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
};

const WarpDialogContext = React.createContext<WarpDialogContextType | null>(null);

export function useWarpDialogContext() {
  const ctx = React.useContext(WarpDialogContext);
  if (!ctx) throw new Error('WarpDialog components must be used inside <WarpDialog>');
  return ctx;
}

export function WarpDialog({
  open: openProp,
  onOpenChange,
  ...props
}: React.ComponentProps<'div'> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = openProp ?? internalOpen;

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const next = typeof value === 'function' ? value(open) : value;
      onOpenChange?.(next);
      if (openProp === undefined) setInternalOpen(next);
    },
    [onOpenChange, open, openProp],
  );

  const contextValue = React.useMemo(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <WarpDialogContext.Provider value={contextValue}>
      <div data-slot="dialog" {...props} />
    </WarpDialogContext.Provider>
  );
}

export function WarpDialogTrigger({ ...props }: React.ComponentProps<'button'>) {
  const { setOpen } = useWarpDialogContext();
  return <button type="button" onClick={() => setOpen((prev) => !prev)} data-slot="dialog-trigger" {...props} />;
}

function WarpDialogOverlay({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('fixed inset-0 z-50 overflow-hidden bg-black/20', className)} {...props}>
      <WarpAnimations />
    </div>
  );
}

export function WarpDialogContent({ children, className, ...props }: React.ComponentProps<typeof motion.div>) {
  const { open, setOpen } = useWarpDialogContext();

  return (
    <AnimatePresence>
      {open && (
        <div className="absolute">
          <WarpDialogOverlay />
          <motion.div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[1000] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.59, 0, 0.35, 1] }}
          >
            <motion.div
              className={cn('relative flex flex-col items-center justify-center gap-4', className)}
              onClick={(e) => e.stopPropagation()}
              initial={{ rotateX: -5, skewY: -1.5, scaleY: 2, scaleX: 0.4, y: 100 }}
              animate={{ rotateX: 0, skewY: 0, scaleY: 1, scaleX: 1, y: 0 }}
              exit={{ rotateX: -5, skewY: -1.5, scaleY: 2, scaleX: 0.4, y: 100 }}
              transition={{ duration: 0.35, ease: [0.59, 0, 0.35, 1] }}
              style={{ transformPerspective: 1000, originX: 0.5, originY: 0 }}
              {...props}
            >
              {children}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function WarpAnimations() {
  return (
    <>
      <motion.div
        className="absolute left-[25%] top-[100%] h-1/2 w-1/2 origin-center rounded-full blur-lg"
        initial={{ scale: 0, opacity: 1, backgroundColor: 'hsl(42, 36%, 58%)' }}
        animate={{ scale: 10, opacity: 0.18, backgroundColor: 'hsl(205, 19%, 54%)' }}
        exit={{ scale: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
      <motion.div
        className="absolute left-[-50%] top-[-25%] h-full w-full rounded-full bg-slate-300/40 blur-[100px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.55, scale: [1, 0.7, 1] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, scale: { duration: 15, repeat: Infinity, ease: 'easeInOut' } }}
      />
    </>
  );
}
