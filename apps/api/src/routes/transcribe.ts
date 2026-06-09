import { Router } from 'express';
import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { requireSpendableFincoins } from '../middleware/fincoin-guard';
import { chargeFincoinOperation } from '../services/fincoin.service';
import { getConfig } from '../config';

const router = Router();

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg']);

const transcribePayloadSchema = z.object({
  file: z.object({
    name: z.string().min(1),
    base64: z.string().min(1),
    mimeType: z.string().optional(),
  }),
});

function decodeBase64File(base64: string): Buffer {
  const normalized = String(base64 ?? '').trim();
  if (!normalized) {
    throw new Error('Archivo de audio vacío');
  }

  const buffer = Buffer.from(normalized, 'base64');
  const canonical = buffer.toString('base64').replace(/=+$/, '');
  const incoming = normalized.replace(/=+$/, '');
  if (canonical !== incoming) {
    throw new Error('Archivo de audio base64 inválido');
  }

  return buffer;
}

router.post(
  '/',
  requireAuth,
  requireSpendableFincoins('transcribe'),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (user) {
      await chargeFincoinOperation(user.id, 'transcribe');
    }
    const config = getConfig();
    const parsed = transcribePayloadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Missing audio file payload' });
    }

    if (!config.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const { name, base64, mimeType } = parsed.data.file;
    const fileBuffer = decodeBase64File(base64);
    if (fileBuffer.byteLength > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: 'File too large (max 10 MB)' });
    }

    const resolvedMime = String(mimeType ?? '').trim();
    if (!ALLOWED_MIME.has(resolvedMime)) {
      return res.status(415).json({ error: 'Unsupported audio format' });
    }

    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    const file = await toFile(fileBuffer, name);
    const transcription = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'es',
    });

    return res.json({ text: transcription.text });
  }),
);

export default router;
