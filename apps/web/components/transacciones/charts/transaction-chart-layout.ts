/** Shared Recharts layout so plot endpoints keep equal side breathing room. */
export const TX_CHART_SURFACE_PADDING_X_PX = 12;

export const TX_CHART_MARGIN = {
  top: 12,
  right: 20,
  left: 8,
  bottom: 10,
} as const;

export const TX_CHART_Y_AXIS_WIDTH = 52;

export const TX_CHART_X_AXIS_PADDING = {
  left: 24,
  right: 24,
} as const;

export const TX_CHART_CATEGORY_Y_AXIS_WIDTH = 96;

/** Fixed viewport height — ResponsiveContainer height="100%" collapses inside mobile flex scroll hosts. */
export const TX_CHART_VIEWPORT_HEIGHT = 220;
