/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('interview storage safeguards', () => {
  it('keeps browser persistence scoped to session storage only', () => {
    const storePath = path.join(process.cwd(), 'state', 'interview.store.ts');
    const storeSource = fs.readFileSync(storePath, 'utf8');
    const voiceStatePath = path.join(process.cwd(), 'lib', 'sesion', 'interviewVoiceState.ts');
    const voiceStateSource = fs.readFileSync(voiceStatePath, 'utf8');

    expect(storeSource).toContain('storage: createJSONStorage(() => sessionStorage)');
    expect(storeSource).not.toContain('answersByBlock: state.answersByBlock');
    expect(storeSource).not.toContain('transcriptEntries: state.transcriptEntries');
    expect(storeSource).not.toContain('lastResponse: state.lastResponse');

    expect(voiceStateSource).toContain('window.sessionStorage.getItem(INTERVIEW_UI_STATE_KEY)');
    expect(voiceStateSource).toContain('window.sessionStorage.setItem(INTERVIEW_UI_STATE_KEY, raw);');
    expect(voiceStateSource).not.toContain('window.localStorage');
  });
});
