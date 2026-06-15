import {
  normalizeInterviewVoiceAuraRms,
  smoothInterviewVoiceAuraLevel,
} from '../modales/entrevista/interview-voice-aura.audio';

describe('interview voice aura audio', () => {
  it('normalizes RMS into a bounded envelope', () => {
    expect(normalizeInterviewVoiceAuraRms(0)).toBe(0);
    expect(normalizeInterviewVoiceAuraRms(0.08)).toBeGreaterThan(0.2);
    expect(normalizeInterviewVoiceAuraRms(0.4)).toBe(1);
  });

  it('smooths level changes with faster attack than decay', () => {
    const rising = smoothInterviewVoiceAuraLevel(0.1, 0.9);
    const falling = smoothInterviewVoiceAuraLevel(0.9, 0.1);

    expect(rising).toBeGreaterThan(0.55);
    expect(falling).toBeGreaterThan(0.1);
    expect(falling).toBeLessThan(0.9);
    expect(rising - 0.1).toBeGreaterThan(0.9 - falling);
  });
});
