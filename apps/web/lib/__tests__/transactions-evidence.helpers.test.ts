import {
  buildEvidenceAppendNotice,
  getEvidenceUploadCapacity,
  mergeEvidenceFiles,
} from '../transacciones/evidencia.helpers';

function file(name: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type: 'image/jpeg' });
}

describe('transactions-evidence.helpers', () => {
  it('computes remaining upload capacity from uploaded count only', () => {
    expect(getEvidenceUploadCapacity(25, 0)).toBe(25);
    expect(getEvidenceUploadCapacity(25, 21)).toBe(4);
  });

  it('merges files until count and total byte limits', () => {
    const result = mergeEvidenceFiles([], [file('a.jpg', 8_000_000), file('b.jpg', 8_000_000), file('c.jpg', 8_000_000)], {
      capacity: 25,
      maxSingleBytes: 10 * 1024 * 1024,
      maxTotalBytes: 20 * 1024 * 1024,
    });

    expect(result.files).toHaveLength(2);
    expect(result.exceededTotalBytes).toBe(true);
    expect(result.addedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
  });

  it('respects per-product file count capacity', () => {
    const pending = [file('p1.jpg', 100), file('p2.jpg', 100)];
    const result = mergeEvidenceFiles(pending, [file('n1.jpg', 100), file('n2.jpg', 100)], {
      capacity: 3,
      maxSingleBytes: 10 * 1024 * 1024,
      maxTotalBytes: 50 * 1024 * 1024,
    });

    expect(result.files).toHaveLength(3);
    expect(result.exceededSlots).toBe(true);
  });

  it('builds a helpful notice when some files are skipped', () => {
    const notice = buildEvidenceAppendNotice(
      {
        files: [file('a.jpg', 100)],
        oversizeNames: [],
        exceededSlots: true,
        exceededTotalBytes: false,
        skippedCount: 2,
        addedCount: 1,
      },
      {
        maxFilesPerProduct: 25,
        maxSingleBytes: 10 * 1024 * 1024,
        maxTotalBytes: 50 * 1024 * 1024,
      },
    );

    expect(notice).toContain('Se agregaron 1');
    expect(notice).toContain('25 archivos');
  });
});
