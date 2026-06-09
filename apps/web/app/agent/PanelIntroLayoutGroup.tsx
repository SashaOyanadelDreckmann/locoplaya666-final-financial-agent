'use client';

import { LayoutGroup } from 'framer-motion';
import type { ReactNode } from 'react';

export function PanelIntroLayoutGroup(props: { active: boolean; children: ReactNode }) {
  if (!props.active) return <>{props.children}</>;
  return <LayoutGroup id="panel-intro">{props.children}</LayoutGroup>;
}
