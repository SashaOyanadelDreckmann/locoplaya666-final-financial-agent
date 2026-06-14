import { cn } from '@/lib/compartido/utils';

type FincoinIconProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export function FincoinIcon({ size = 'md', className }: FincoinIconProps) {
  return (
    <span className={cn('fincoin-icon', `fincoin-icon--${size}`, className)} aria-hidden="true">
      $
    </span>
  );
}
