import type { ChatUploadFileKind } from './chat-upload.helpers';

export type UserUploadBubbleFile = {
  name: string;
  mime?: string;
  kind: ChatUploadFileKind;
  sizeLabel?: string;
  previewUrl?: string;
};

export type UserUploadBubbleProps = {
  files: UserUploadBubbleFile[];
  status?: 'processing' | 'ready' | 'error';
  maxFiles?: number;
};

function PdfIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M14 3v6h6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 13.5h7M8.5 16.5h5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4h6l4 4v12a1 1 0 01-1 1H8a1 1 0 01-1-1V5a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M14 4v4h4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function kindLabel(kind: ChatUploadFileKind): string {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'spreadsheet') return 'Hoja';
  if (kind === 'image') return 'Imagen';
  return 'Documento';
}

function UploadFileCard(props: { file: UserUploadBubbleFile; compact: boolean }) {
  const { file, compact } = props;
  const showImagePreview = file.kind === 'image' && Boolean(file.previewUrl);

  return (
    <article
      className={`user-upload-card user-upload-card--${file.kind}${compact ? ' is-compact' : ''}`}
      aria-label={`${kindLabel(file.kind)}: ${file.name}`}
    >
      <div
        className={`user-upload-card-preview${showImagePreview ? ' user-upload-card-preview--image' : ''}${
          file.kind === 'pdf' ? ' user-upload-card-preview--pdf' : ''
        }`}
      >
        {showImagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.previewUrl} alt={file.name} className="user-upload-card-image" loading="lazy" />
        ) : (
          <>
            {file.kind === 'pdf' ? <div className="user-upload-pdf-lines" aria-hidden="true" /> : null}
            <div className={`user-upload-type-badge user-upload-type-badge--${file.kind}`}>
              {file.kind === 'pdf' ? <PdfIcon /> : file.kind === 'spreadsheet' ? <SheetIcon /> : <DocIcon />}
              <span>{kindLabel(file.kind)}</span>
            </div>
          </>
        )}
      </div>
      <div className="user-upload-card-meta">
        <span className="user-upload-card-name" title={file.name}>
          {file.name}
        </span>
        {file.sizeLabel ? <span className="user-upload-card-size">{file.sizeLabel}</span> : null}
      </div>
    </article>
  );
}

export function UserUploadBubble(props: UserUploadBubbleProps) {
  const maxFiles = props.maxFiles ?? 5;
  const fileCount = props.files.length;
  const isSingle = fileCount === 1;
  const status = props.status ?? 'ready';

  const statusCopy =
    status === 'processing'
      ? 'Escaneando contenido…'
      : status === 'error'
        ? 'No se pudo procesar uno o más archivos'
        : `${fileCount} archivo${fileCount === 1 ? '' : 's'} listo${fileCount === 1 ? '' : 's'} para análisis`;

  return (
    <div className="user-upload-pack" role="group" aria-label="Archivos adjuntos">
      <div className="user-upload-pack-header">
        <span className="user-upload-pack-kicker">Archivos adjuntos</span>
        <span className="user-upload-pack-count">
          {fileCount}/{maxFiles}
        </span>
      </div>

      <div className={`user-upload-grid${isSingle ? ' is-single' : ''}`}>
        {props.files.map((file, idx) => (
          <UploadFileCard
            key={`${file.name}-${file.sizeLabel ?? '0'}-${idx}`}
            file={file}
            compact={!isSingle}
          />
        ))}
      </div>

      <div
        className={`user-upload-pack-footer${status === 'processing' ? ' is-processing' : ''}${
          status === 'error' ? ' is-error' : ''
        }`}
        aria-live="polite"
      >
        {status === 'processing' ? <span className="user-upload-pack-spinner" aria-hidden="true" /> : null}
        <span>{statusCopy}</span>
      </div>
    </div>
  );
}
