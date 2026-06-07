/** @jest-environment node */

import {
  buildTxStages,
  deriveActiveTxStageIndex,
  deriveCurrentStage,
} from '../tx-wizard.helpers';
import type { TxWizardStep } from '../types';

describe('tx wizard helpers', () => {
  it('maps wizard steps to stage index and flow stage', () => {
    expect(deriveActiveTxStageIndex('credentials')).toBe(0);
    expect(deriveActiveTxStageIndex('upload')).toBe(1);
    expect(deriveActiveTxStageIndex('dashboard')).toBe(2);
    expect(deriveActiveTxStageIndex('products')).toBe(-1);
    expect(deriveCurrentStage('upload')).toBe('evidence');
  });

  it('disables analyst stage until evidence exists', () => {
    const setTxWizardStep = jest.fn();
    const lockedWithoutEvidence = buildTxStages({
      consentLocked: true,
      hasEvidence: false,
      setTxWizardStep,
    });
    expect(lockedWithoutEvidence[2]?.disabled).toBe(true);
    expect(lockedWithoutEvidence[2]?.disabledReason).toMatch(/evidencia/i);

    const ready = buildTxStages({
      consentLocked: true,
      hasEvidence: true,
      setTxWizardStep,
    });
    ready[2]?.go();
    expect(setTxWizardStep).toHaveBeenCalledWith('dashboard');
  });

});
