declare module 'react-katex' {
  import type { ComponentType, HTMLAttributes, ReactNode } from 'react';

  type MathProps = HTMLAttributes<HTMLElement> & {
    math: string;
    errorColor?: string;
    renderError?: (error: Error) => ReactNode;
  };

  export const InlineMath: ComponentType<MathProps>;
  export const BlockMath: ComponentType<MathProps>;
}
