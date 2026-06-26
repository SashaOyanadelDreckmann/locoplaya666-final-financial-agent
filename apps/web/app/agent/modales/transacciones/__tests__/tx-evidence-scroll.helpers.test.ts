import { revealTransactionsEvidenceContinueStep } from '../tx-evidence-scroll.helpers';

describe('revealTransactionsEvidenceContinueStep', () => {
  it('scrolls tx-scroll-body when the continue anchor sits below the fold', () => {
    const scrollHost = document.createElement('div');
    scrollHost.className = 'tx-scroll-body';
    scrollHost.style.height = '200px';
    scrollHost.style.overflow = 'auto';
    Object.defineProperty(scrollHost, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(scrollHost, 'scrollTop', { value: 0, writable: true, configurable: true });
    scrollHost.scrollTo = jest.fn();

    const anchor = document.createElement('div');
    scrollHost.appendChild(anchor);
    document.body.appendChild(scrollHost);

    jest.spyOn(scrollHost, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 200,
      left: 0,
      right: 320,
      width: 320,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    jest.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      top: 180,
      bottom: 320,
      left: 0,
      right: 320,
      width: 320,
      height: 140,
      x: 0,
      y: 180,
      toJSON: () => ({}),
    });

    revealTransactionsEvidenceContinueStep(anchor, { behavior: 'auto' });

    expect(scrollHost.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({
        top: expect.any(Number),
        behavior: 'auto',
      }),
    );
    const call = (scrollHost.scrollTo as jest.Mock).mock.calls[0][0];
    expect(call.top).toBeGreaterThan(0);

    scrollHost.remove();
  });
});
