import { lazy, Suspense } from 'react';

/**
 * Hook para lazy loading de KaTeX
 * Reduce el bundle size principal cuando no se usa renderizado matemático
 */
export const useLazyKatex = () => {
  const BlockMathLazy = lazy(() =>
    import('react-katex').then((mod) => ({
      default: mod.BlockMath,
    }))
  );

  const InlineMathLazy = lazy(() =>
    import('react-katex').then((mod) => ({
      default: mod.InlineMath,
    }))
  );

  return {
    BlockMathLazy,
    InlineMathLazy,
    Suspense,
  };
};

export default useLazyKatex;
