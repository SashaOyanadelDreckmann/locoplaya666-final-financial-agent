import {
  resolveInterviewVoiceAuraPhase,
  sampleInterviewVoiceAuraMotion,
  smoothInterviewVoiceAuraPresence,
} from '../modales/entrevista/interview-voice-aura.helpers';

describe('interview voice aura', () => {
  it('maps agent speech to speaking and ignores user mic activity', () => {
    expect(
      resolveInterviewVoiceAuraPhase({
        voiceAwaitingMic: false,
        voiceConnecting: false,
        voiceConnected: true,
        voicePaused: false,
        voiceListening: true,
        voiceSpeaking: true,
      }),
    ).toBe('speaking');

    expect(
      resolveInterviewVoiceAuraPhase({
        voiceAwaitingMic: false,
        voiceConnecting: false,
        voiceConnected: true,
        voicePaused: false,
        voiceListening: true,
        voiceSpeaking: false,
      }),
    ).toBe('idle');

    expect(
      resolveInterviewVoiceAuraPhase({
        voiceAwaitingMic: false,
        voiceConnecting: false,
        voiceConnected: true,
        voicePaused: true,
        voiceListening: false,
        voiceSpeaking: false,
      }),
    ).toBe('paused');
  });

  it('amplifies motion sharply while the agent is speaking', () => {
    const idle = sampleInterviewVoiceAuraMotion('idle', 1.2);
    const speaking = sampleInterviewVoiceAuraMotion('speaking', 1.2, 0.82);

    expect(speaking.scale).toBeGreaterThan(idle.scale + 0.35);
    expect(speaking.bloom).toBeGreaterThan(idle.bloom + 0.5);
    expect(speaking.coreGlow).toBeGreaterThan(idle.coreGlow + 0.4);
    expect(Math.abs(speaking.orbAX)).toBeGreaterThan(Math.abs(idle.orbAX) + 10);
  });

  it('settles motion when agent audio level is silent', () => {
    const loud = sampleInterviewVoiceAuraMotion('speaking', 1.2, 0.9);
    const silent = sampleInterviewVoiceAuraMotion('speaking', 1.2, 0);

    expect(loud.scale).toBeGreaterThan(silent.scale + 0.4);
    expect(loud.bloom).toBeGreaterThan(silent.bloom + 0.6);
  });

  it('ramps presence gradually instead of snapping to speaking motion', () => {
    const idle = sampleInterviewVoiceAuraMotion('idle', 1.2, 0, 0);
    const partial = sampleInterviewVoiceAuraMotion('idle', 1.2, 0.7, 0.35);
    const full = sampleInterviewVoiceAuraMotion('idle', 1.2, 0.9, 1);

    expect(partial.scale).toBeGreaterThan(idle.scale);
    expect(partial.scale).toBeLessThan(full.scale);
    expect(partial.bloom).toBeGreaterThan(idle.bloom);
    expect(partial.bloom).toBeLessThan(full.bloom);
  });

  it('eases presence envelope over multiple frames', () => {
    let presence = 0;
    for (let i = 0; i < 8; i += 1) {
      presence = smoothInterviewVoiceAuraPresence(presence, 1);
    }

    expect(presence).toBeGreaterThan(0.2);
    expect(presence).toBeLessThan(0.55);
  });
});
