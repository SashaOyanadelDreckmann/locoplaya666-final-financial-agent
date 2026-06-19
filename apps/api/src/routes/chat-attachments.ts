/**
 * Adjuntos del chat principal — pipeline independiente del modal de transacciones.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth';
import { requireSpendableFincoins } from '../middleware/fincoin-guard';
import { chargeActualUsdSpent } from '../services/fincoin.service';
import { asyncHandler } from '../middleware/errorHandler';
import { badRequest, unauthorized } from '../http/api.errors';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { PERMISSIONS } from '../auth/rbac';
import { runWithLLMCostTracking } from '../services/llm.service';
import {
  analyzeChatAttachments,
  CHAT_ATTACH_MAX_FILES,
  CHAT_ATTACH_MAX_TOTAL_BYTES,
} from '../services/chatAttachmentAnalysis.service';
import {
  decodeBase64File,
  isSupportedDocumentFilename,
} from './documents';

const router = Router();

const ChatAttachRequestSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(260),
        base64: z.string().min(1),
        mimeType: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(CHAT_ATTACH_MAX_FILES),
});

function validateChatAttachmentFiles(
  files: Array<{ name: string; base64: string; mimeType?: string }>,
): Array<{ name: string; base64: string; mimeType?: string; buffer: Buffer }> {
  const decodedFiles = files.map((file) => {
    if (!isSupportedDocumentFilename(file.name)) {
      throw badRequest(
        `Archivo "${file.name}" no soportado. Usa PDF, imagen, XLS/XLSX, CSV/TSV, TXT/MD, JSON, XML, YAML o LOG.`,
      );
    }
    const buffer = decodeBase64File(file.base64, file.name);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'pdf') {
      const magic = buffer.slice(0, 4).toString('ascii');
      if (magic !== '%PDF') {
        throw badRequest(`Archivo "${file.name}" no es un PDF válido.`);
      }
    }

    const textExtensions = new Set(['csv', 'tsv', 'txt', 'md', 'log']);
    if (textExtensions.has(ext)) {
      const sample = buffer.slice(0, 512).toString('utf8').toLowerCase();
      if (/<html[\s>]|<!doctype\s+html|<script[\s>]/i.test(sample)) {
        throw badRequest(`Archivo "${file.name}" contiene HTML y no es un documento válido.`);
      }
    }

    return { ...file, buffer };
  });

  const totalBytes = decodedFiles.reduce((sum, file) => sum + file.buffer.byteLength, 0);
  if (totalBytes > CHAT_ATTACH_MAX_TOTAL_BYTES) {
    throw badRequest(
      `El total cargado supera ${Math.round(CHAT_ATTACH_MAX_TOTAL_BYTES / (1024 * 1024))} MB. Divide los archivos en bloques.`,
    );
  }

  return decodedFiles;
}

router.post(
  '/analyze',
  requireAuth,
  requirePermission(PERMISSIONS.DOCUMENT_PARSE_SELF),
  requireSpendableFincoins('chat.attach'),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Authentication required');

    const body = parseBody(ChatAttachRequestSchema, req.body);
    const decodedFiles = validateChatAttachmentFiles(body.files);

    const { result, costUsd } = await runWithLLMCostTracking(async () =>
      analyzeChatAttachments({
        userId: user.id,
        files: decodedFiles.map(({ name, buffer, mimeType }) => ({ name, buffer, mimeType })),
      }),
    );

    if (result.attachments.length === 0) {
      throw badRequest('No se pudo analizar ningún archivo adjunto.');
    }

    await chargeActualUsdSpent(user.id, costUsd);
    return sendSuccess(res, result);
  }),
);

export default router;
