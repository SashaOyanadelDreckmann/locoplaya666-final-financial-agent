import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  fetchServerSession,
  hasCompletedIntakeAccess,
  resolveServerBackendBase,
} from '@/lib/sessionAccess';

export const dynamic = 'force-dynamic';

function buildCookieHeader(cookieList: Array<{ name: string; value: string }>): string {
  return cookieList.map((entry) => `${entry.name}=${entry.value}`).join('; ');
}

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieHeader = buildCookieHeader(
    cookieStore.getAll().map((entry) => ({ name: entry.name, value: entry.value })),
  );

  if (!cookieHeader.trim()) {
    redirect('/login?next=/agent');
  }

  const backendBase = resolveServerBackendBase({
    requestOrigin: null,
    forwardedHost: headerStore.get('x-forwarded-host') ?? headerStore.get('host'),
    forwardedProto: headerStore.get('x-forwarded-proto'),
  });

  const { session, status } = await fetchServerSession({ cookieHeader, backendBase });

  if (status === 403) {
    redirect('/waiting-approval');
  }
  if (!session?.id) {
    redirect('/login?next=/agent');
  }
  if (!hasCompletedIntakeAccess(session.injectedIntake)) {
    redirect('/intake');
  }

  return children;
}
