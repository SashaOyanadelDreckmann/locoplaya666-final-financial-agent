import { buildIntakeScrambleLines } from '../flujo/welcome-intake-scramble.helpers';

describe('buildIntakeScrambleLines', () => {
  it('starts with first name and includes intake fields', () => {
    const lines = buildIntakeScrambleLines({
      name: 'Camila Rojas',
      injectedIntake: {
        intake: {
          city: 'Santiago',
          incomeBand: '600k-1M',
          employmentStatus: 'employed',
          expensesCoverage: 'tight',
          hasDebt: true,
          hasSavingsOrInvestments: false,
          moneyStressLevel: 7,
        },
      },
    });

    expect(lines[0]).toBe('Camila');
    expect(lines.some((line: string) => line.includes('Santiago'))).toBe(true);
    expect(lines.some((line: string) => line.includes('600k'))).toBe(true);
    expect(lines.some((line: string) => line.includes('Estrés'))).toBe(true);
  });

  it('falls back to a single name line when intake is missing', () => {
    expect(buildIntakeScrambleLines({ name: 'Ana' })).toEqual(['Ana']);
  });
});
