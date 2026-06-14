'use client';

import { LayoutGroup } from 'framer-motion';
import type { ReactNode } from 'react';

/** Stable wrapper — avoids remounting the agent tree when intro toggles. */
export function PanelIntroLayoutGroup(props: { children: ReactNode }) {
  return <LayoutGroup id="panel-intro">{props.children}</LayoutGroup>;
}
