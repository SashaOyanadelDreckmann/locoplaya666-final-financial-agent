import type { ComponentPropsWithoutRef, CSSProperties, PropsWithChildren } from 'react';

type PanelCardProps = PropsWithChildren<
  Omit<ComponentPropsWithoutRef<'article'>, 'children'> & {
  label?: string;
  value?: string;
  className?: string;
  bgImage?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  bgScale?: number;
  bgPosition?: string;
  dataMode?: string;
}>;

export default function PanelCard({
  label,
  value,
  className,
  children,
  bgImage,
  overlayColor,
  overlayOpacity,
  bgScale,
  bgPosition,
  dataMode,
  ...rest
}: PanelCardProps) {
  const classes = ['panel-card', className].filter(Boolean).join(' ');
  const style = {
    ...(bgImage ? { ['--card-bg' as string]: `url('${bgImage}')` } : {}),
    ...(overlayColor ? { ['--card-overlay-color' as string]: overlayColor } : {}),
    ...(typeof overlayOpacity === 'number'
      ? { ['--card-overlay-opacity' as string]: String(overlayOpacity) }
      : {}),
    ...(typeof bgScale === 'number' ? { ['--bg-scale' as string]: String(bgScale) } : {}),
    ...(bgPosition ? { ['--bg-position' as string]: bgPosition } : {}),
  } as CSSProperties;

  return (
    <article className={classes} style={style} data-mode={dataMode} {...rest}>
      {label ? <p className="panel-label">{label}</p> : null}
      {value ? <h4 className="panel-value">{value}</h4> : null}
      {children}
    </article>
  );
}
