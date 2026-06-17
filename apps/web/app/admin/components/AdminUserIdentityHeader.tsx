'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useAdminIdentityReveal } from '../hooks/use-admin-identity-reveal';

type Props = {
  userId: string;
  name: string;
  email: string;
  tags?: ReactNode;
  className?: string;
  style?: CSSProperties;
  revealed?: boolean;
  onIdentityTargetClick?: () => void;
};

export function AdminUserIdentityHeader({
  userId,
  name,
  email,
  tags,
  className = 'admin-dossier-head',
  style,
  revealed: revealedProp,
  onIdentityTargetClick: onIdentityTargetClickProp,
}: Props) {
  const internal = useAdminIdentityReveal(revealedProp === undefined ? userId : undefined);
  const revealed = revealedProp ?? internal.revealed;
  const onIdentityTargetClick = onIdentityTargetClickProp ?? internal.onIdentityTargetClick;

  return (
    <div className={className} style={style}>
      <div className="admin-identity-target" onClick={onIdentityTargetClick}>
        {revealed ? (
          <>
            <h2 className="admin-card-title">{name}</h2>
            <p className="admin-card-sub">{email}</p>
          </>
        ) : (
          <h2 className="admin-card-title">
            <code className="admin-id-ref">{userId}</code>
          </h2>
        )}
      </div>
      {tags}
    </div>
  );
}
