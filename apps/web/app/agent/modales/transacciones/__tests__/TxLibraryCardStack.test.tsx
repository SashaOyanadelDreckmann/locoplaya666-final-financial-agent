/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TxLibraryCardStack } from '../TxLibraryCardStack';
import type { BankProduct } from '../types';

jest.mock('@/components/ui/scanner-card-stream', () => ({
  ScannerCardStream: ({
    items,
    renderCard,
  }: {
    items: Array<{ product: BankProduct; intel: { docs: number; amounts: number[] } }>;
    renderCard: (
      item: { product: BankProduct; intel: { docs: number; amounts: number[] } },
      index: number,
      isFocused: boolean,
    ) => ReactNode;
  }) => (
    <div data-testid="scanner-stream">
      {items.map((item, index) => (
        <div key={item.product.id} data-testid={`card-${index}`}>
          {renderCard(item, index, index === 0)}
        </div>
      ))}
    </div>
  ),
}));

function buildProduct(overrides: Partial<BankProduct> = {}): BankProduct {
  return {
    id: 'prod-lib-1',
    label: 'Cuenta vista',
    bank: 'Banco Test',
    assistant: { messages: [] },
    productType: 'checking_account',
    simulationAccepted: true,
    connected: true,
    randomMode: false,
    uploadedFiles: ['cartola.pdf'],
    parsedDocuments: [{ name: 'cartola.pdf', text: 'mov 1' }],
    evidenceResetsUsed: 0,
    ...overrides,
  };
}

describe('TxLibraryCardStack', () => {
  it('calls onDelete when the focused card delete button is clicked', () => {
    const onDelete = jest.fn();
    const product = buildProduct();

    render(
      <TxLibraryCardStack
        cards={[{ product, intel: { docs: 1, amounts: [1000] } }]}
        productCarouselIndex={0}
        recentlyDockedProductId={null}
        prefersReducedMotion
        transitionPulse={0}
        onSelectAt={jest.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Cuenta vista' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('prod-lib-1');
  });
});
