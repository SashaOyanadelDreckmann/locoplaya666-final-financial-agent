/** @jest-environment node */

import type { ChatItem } from '@/lib/agente/agent.response.types';
import { sanitizeChatItems } from '../utilidades/page.utils';

describe('sanitizeChatItems upload persistence', () => {
  it('strips ephemeral blob previews and normalizes processing status', () => {
    const items: ChatItem[] = [
      {
        type: 'upload',
        role: 'user',
        uploadId: 'upload-1',
        status: 'processing',
        files: [
          {
            name: 'foto.jpg',
            kind: 'image',
            previewUrl: 'blob:http://localhost/abc',
          },
        ],
      },
    ];

    const sanitized = sanitizeChatItems(items);
    expect(sanitized).toHaveLength(1);
    const upload = sanitized[0];
    expect(upload.type).toBe('upload');
    if (upload.type !== 'upload') return;
    expect(upload.status).toBe('ready');
    expect(upload.files[0]?.previewUrl).toBeUndefined();
  });
});
