import React, { type ReactElement, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

function stripLockedClass(className?: string): string {
  return (className ?? '').replace(/\bis-locked\b/g, '').replace(/\s+/g, ' ').trim();
}

function presentStatusCopy(text: string): string {
  if (/bloqueado/i.test(text)) return '● Activo';
  return text;
}

function presentIntroChildren(children: ReactNode): ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;

    const props = child.props as { className?: string; children?: ReactNode };
    const className = props.className ?? '';

    if (/\bpanel-feature-status\b/.test(className) || /\binterview-flow-meta\b/.test(className)) {
      const copy =
        typeof props.children === 'string'
          ? presentStatusCopy(props.children)
          : props.children;
      return React.cloneElement(child, { className: stripLockedClass(className) }, copy);
    }

    if (/\binterview-flow-label\b/.test(className) && typeof props.children === 'string') {
      const copy = /bloqueado/i.test(props.children) ? 'Entrevista disponible' : props.children;
      return React.cloneElement(child, { className: stripLockedClass(className) }, copy);
    }

    if (props.children) {
      return React.cloneElement(child, {
        className: stripLockedClass(className),
        children: presentIntroChildren(props.children),
      });
    }

    return React.cloneElement(child, { className: stripLockedClass(className) });
  });
}

export function presentPanelCardForIntro(node: ReactElement): ReactElement {
  const props = node.props as { children?: React.ReactNode; className?: string };

  if (node.type === 'div' && typeof props.className === 'string' && /\bmob-col\b/.test(props.className)) {
    const child = React.Children.toArray(props.children).find(React.isValidElement);
    if (child && React.isValidElement(child)) {
      return React.cloneElement(node, {}, presentPanelCardForIntro(child as ReactElement));
    }
  }

  const nextClassName = cn(stripLockedClass(props.className), 'panel-intro-showcase');

  return React.cloneElement(node, {
    className: nextClassName,
    children: presentIntroChildren(props.children),
  } as Record<string, unknown>);
}
