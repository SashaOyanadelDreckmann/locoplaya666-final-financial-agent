import {
  buildChatUploadAgentPrompt,
  buildChatUploadFiles,
  buildChatUploadUserMessage,
  filterChatUploadFiles,
  formatUploadFileSize,
  inferChatUploadFileKind,
  mapChatAttachmentAnalysisToSummary,
  mergeChatUploadFiles,
} from '../chat/chat-upload.helpers';

describe('chat-upload.helpers', () => {
  it('infers file kinds from mime and extension', () => {
    expect(inferChatUploadFileKind({ name: 'foto.jpg', type: 'image/jpeg' })).toBe('image');
    expect(inferChatUploadFileKind({ name: 'estado.pdf', type: 'application/pdf' })).toBe('pdf');
    expect(inferChatUploadFileKind({ name: 'movs.csv', type: 'text/csv' })).toBe('spreadsheet');
    expect(inferChatUploadFileKind({ name: 'notas.txt', type: 'text/plain' })).toBe('document');
  });

  it('formats readable file sizes', () => {
    expect(formatUploadFileSize(512)).toBe('512 B');
    expect(formatUploadFileSize(2048)).toBe('2.0 KB');
    expect(formatUploadFileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('builds upload metadata with image preview urls', () => {
    const createObjectURL = jest.fn(() => 'blob:mock-preview');
    const original = URL.createObjectURL;
    URL.createObjectURL = createObjectURL;

    try {
      const file = new File(['hello'], 'scan.png', { type: 'image/png' });
      const [upload] = buildChatUploadFiles([file]);
      expect(upload.kind).toBe('image');
      expect(upload.previewUrl).toBe('blob:mock-preview');
      expect(upload.sizeLabel).toBeTruthy();
      expect(createObjectURL).toHaveBeenCalledWith(file);
    } finally {
      URL.createObjectURL = original;
    }
  });

  it('maps chat attachment analysis into agent summary', () => {
    const summary = mapChatAttachmentAnalysisToSummary({
      name: 'selfie.jpg',
      format: 'jpg',
      contentKind: 'personal_photo',
      relevanceToFinance: 'none',
      description: 'Retrato en interior',
      keyFindings: ['No hay montos visibles'],
      amounts: [],
      calculations: [],
      extractedText: 'Persona sonriendo',
      confidence: 0.91,
    });
    expect(summary.contentKind).toBe('personal_photo');
    expect(summary.relevanceToFinance).toBe('none');
    expect(summary.preview).toContain('Persona');
  });

  it('builds adaptive agent prompt for non-financial photos', () => {
    const prompt = buildChatUploadAgentPrompt({
      fileNames: ['selfie.jpg'],
      attachments: [
        {
          name: 'selfie.jpg',
          format: 'jpg',
          contentKind: 'personal_photo',
          relevanceToFinance: 'none',
          description: 'Retrato personal',
          keyFindings: ['Sin datos financieros'],
        },
      ],
    });
    expect(prompt).toContain('ADJUNTOS_CHAT_JSON=');
    expect(prompt).toContain('no es evidencia financiera');
    expect(prompt).not.toContain('ANALISIS_TRANSACCIONAL_JSON');
  });

  it('merges pending chat uploads with slot and byte limits', () => {
    const first = new File(['a'], 'a.png', { type: 'image/png' });
    const second = new File(['b'], 'b.pdf', { type: 'application/pdf' });
    const merged = mergeChatUploadFiles([first], [second], { maxFiles: 2, maxTotalBytes: 1024 * 1024 });
    expect(merged.files).toHaveLength(2);
    expect(merged.addedCount).toBe(1);
  });

  it('filters unsupported chat upload formats', () => {
    const accepted = new File(['x'], 'scan.png', { type: 'image/png' });
    const rejected = new File(['x'], 'video.mp4', { type: 'video/mp4' });
    const result = filterChatUploadFiles([accepted, rejected]);
    expect(result.accepted).toEqual([accepted]);
    expect(result.rejected).toEqual([rejected]);
  });

  it('uses user message when present and falls back otherwise', () => {
    expect(
      buildChatUploadUserMessage({ userMessage: '¿Cuánto gasté?', fileNames: ['cartola.pdf'] }),
    ).toBe('¿Cuánto gasté?');
    expect(buildChatUploadUserMessage({ fileNames: ['cartola.pdf'] })).toContain('cartola.pdf');
  });

  it('includes user context in agent prompt', () => {
    const prompt = buildChatUploadAgentPrompt({
      fileNames: ['foto.jpg'],
      userMessage: '¿Es un gasto deducible?',
      attachments: [
        {
          name: 'foto.jpg',
          format: 'jpg',
          contentKind: 'general_image',
          relevanceToFinance: 'low',
          description: 'Boleta',
          keyFindings: [],
        },
      ],
    });
    expect(prompt).toContain('¿Es un gasto deducible?');
  });

  it('builds finance-first prompt when evidence is financial', () => {
    const prompt = buildChatUploadAgentPrompt({
      fileNames: ['cartola.pdf'],
      attachments: [
        {
          name: 'cartola.pdf',
          format: 'pdf',
          contentKind: 'financial_statement',
          relevanceToFinance: 'high',
          description: 'Cartola bancaria',
          keyFindings: ['Saldo visible'],
          amounts: [{ label: 'Saldo', value: 120000, currency: 'CLP' }],
        },
      ],
    });
    expect(prompt).toContain('Prioriza lectura financiera');
  });
});
