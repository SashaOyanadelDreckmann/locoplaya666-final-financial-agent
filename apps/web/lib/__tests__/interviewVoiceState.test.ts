/** @jest-environment jsdom */

import {
  INTERVIEW_UI_STATE_KEY,
  flushInterviewVoiceStateOnPageHide,
  readInterviewVoiceState,
  writeInterviewVoiceState,
} from '../sesion/interviewVoiceState';

describe('interviewVoiceState unload persistence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('writes to sessionStorage and sends a keepalive sync on page hide', () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as typeof fetch;

    const payload = {
      callId: 'call-unload-1',
      callSeconds: 52,
      remainingTotalSec: 128,
      status: 'paused',
    };

    flushInterviewVoiceStateOnPageHide(payload);

    expect(readInterviewVoiceState()).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/conversation/voice/state'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify(payload),
      }),
    );
  });

  it('still persists locally when keepalive sync fails to start', () => {
    global.fetch = jest.fn().mockImplementation(() => {
      throw new Error('network unavailable');
    });

    const payload = { callId: 'call-unload-2', callSeconds: 11, status: 'paused' };
    expect(() => flushInterviewVoiceStateOnPageHide(payload)).not.toThrow();
    expect(window.sessionStorage.getItem(INTERVIEW_UI_STATE_KEY)).toContain('call-unload-2');
  });

  it('writeInterviewVoiceState stores JSON in sessionStorage', () => {
    writeInterviewVoiceState({ callSeconds: 3, status: 'idle' });
    expect(readInterviewVoiceState()).toEqual({ callSeconds: 3, status: 'idle' });
  });
});
