'use client';

/**
 * Legacy standalone interview page.
 * The interview is now handled as a modal on /agent.
 * This page exists only as a fallback redirect to prevent broken links.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InterviewPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/agent?openInterview=1');
  }, [router]);

  return null;
}
