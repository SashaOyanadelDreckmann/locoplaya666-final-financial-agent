import {
  buildChatUploadAgentPrompt,
  buildChatUploadFiles,
  formatUploadFileSize,
  inferChatUploadFileKind,
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

  it('builds agent prompt with scanned document payload', () => {
    const prompt = buildChatUploadAgentPrompt({
      fileNames: ['a.pdf', 'b.jpg'],
      docsSummary: [{ name: 'a.pdf', format: 'pdf', preview: 'texto' }],
    });
    expect(prompt).toContain('DOCUMENTOS_JSON=');
    expect(prompt).toContain('a.pdf');
    expect(prompt).toContain('Opina sobre su contenido');
  });
});
