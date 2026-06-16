import React, { type ReactElement, type ReactNode } from 'react';
import { motion } from 'framer-motion';

import { cn } from '@/lib/compartido/utils';

function stripLockedClass(className?: string): string {
  return (className ?? '').replace(/\bis-locked\b/g, '').replace(/\s+/g, ' ').trim();
}

/** Classes that add matte/glass overlays on top of real card chrome in the portal. */
function stripIntroConflictClasses(className?: string): string {
  return (className ?? '')
    .replace(/\bglass-card\b/g, '')
    .replace(/\bpanel-minimal-soft\b/g, '')
    .replace(/\bis-panel-highlighted\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMotionIntroNode(node: ReactElement): boolean {
  const type = node.type;
  return type === motion.article || type === motion.div || type === motion.button;
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

  const nextClassName = cn(
    stripIntroConflictClasses(stripLockedClass(props.className)),
    'panel-intro-showcase',
  );
  const children = presentIntroChildren(props.children);

  if (typeof node.type === 'string' || !isMotionIntroNode(node)) {
    return React.cloneElement(node, {
      className: nextClassName,
      children,
    } as Record<string, unknown>);
  }

  const {
    initial: _initial,
    animate: _animate,
    transition: _transition,
    whileHover: _whileHover,
    whileTap: _whileTap,
    layout: _layout,
    layoutId: _layoutId,
    delay: _delay,
    hoverable: _hoverable,
    label: _label,
    value: _value,
    bgImage: _bgImage,
    overlayColor: _overlayColor,
    overlayOpacity: _overlayOpacity,
    bgScale: _bgScale,
    bgPosition: _bgPosition,
    dataMode: _dataMode,
    style,
    ...rest
  } = props as Record<string, unknown>;

  return React.createElement(
    'article',
    {
      ...rest,
      className: nextClassName,
      style,
    },
    children,
  );
}

/** Same DOM + classes as MobilePanelCircularDeck.renderStackCard */
export function wrapMobileDeckIntroCard(cardNode: ReactElement, cardKey: string): ReactElement {
  const props = cardNode.props as { className?: string; children?: ReactNode };
  const mobClassName = cn(stripLockedClass(props.className), 'mobile-stack-card-inner', 'panel-morph-card__slot');

  if (cardNode.type === 'div' && typeof props.className === 'string' && /\bmob-col\b/.test(props.className)) {
    const child = React.Children.toArray(props.children).find(React.isValidElement);
    const presentedChild =
      child && React.isValidElement(child)
        ? presentPanelCardForIntro(child as ReactElement)
        : null;

    return (
      <div className="panel-morph-card__deck-chrome mobile-panel-stack-shell">
        <div className="mobile-panel-stack-card" data-panel-card-key={cardKey}>
          {React.cloneElement(
            cardNode,
            { className: mobClassName, children: presentedChild } as Record<string, unknown>,
          )}
        </div>
      </div>
    );
  }

  const presented = presentPanelCardForIntro(cardNode);
  return (
    <div className="panel-morph-card__deck-chrome mobile-panel-stack-shell">
      <div className="mobile-panel-stack-card" data-panel-card-key={cardKey}>
        {React.cloneElement(presented, {
          className: cn(
            (presented.props as { className?: string }).className,
            'mobile-stack-card-inner',
            'panel-morph-card__slot',
          ),
        } as Record<string, unknown>)}
      </div>
    </div>
  );
}
