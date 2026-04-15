import { lazy, Suspense } from 'react';

/**
 * Hook para lazy loading de componentes recharts
 * Reduce el bundle size principal
 */
export const useLazyRecharts = () => {
  const LineChartLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.LineChart,
    }))
  );

  const BarChartLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.BarChart,
    }))
  );

  const PieChartLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.PieChart,
    }))
  );

  const XAxisLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.XAxis,
    }))
  );

  const YAxisLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.YAxis,
    }))
  );

  const CartesianGridLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.CartesianGrid,
    }))
  );

  const TooltipLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.Tooltip,
    }))
  );

  const LegendLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.Legend,
    }))
  );

  const LineLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.Line,
    }))
  );

  const BarLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.Bar,
    }))
  );

  const CellLazy = lazy(() =>
    import('recharts').then((mod) => ({
      default: mod.Cell,
    }))
  );

  return {
    LineChartLazy,
    BarChartLazy,
    PieChartLazy,
    XAxisLazy,
    YAxisLazy,
    CartesianGridLazy,
    TooltipLazy,
    LegendLazy,
    LineLazy,
    BarLazy,
    CellLazy,
    Suspense,
  };
};

export default useLazyRecharts;
