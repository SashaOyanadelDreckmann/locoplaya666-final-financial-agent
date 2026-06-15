import { Suspense } from 'react';
import AdminCommandCenter from './components/AdminCommandCenter';

function AdminLoading() {
  return <div className="admin-loading">Cargando centro de comando…</div>;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminCommandCenter />
    </Suspense>
  );
}
