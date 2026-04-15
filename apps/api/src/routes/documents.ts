/**
 * Parsea documentos PDF/Excel/CSV subidos desde el chat.
 * Retorna el texto extraído para que el agente lo use.
 */

import { Router } from 'express';
import { z } from 'zod';
import { parseTransactionFile } from '../services/transactionParser.service';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { badRequest } from '../http/api.errors';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { PERMISSIONS } from '../auth/rbac';

const router = Router();

const ParseRequestSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1),
        base64: z.string().min(1),
      }),
    )
    .min(1)
    .max(5),
});

router.post(
  '/parse',
  requireAuth,
  requirePermission(PERMISSIONS.DOCUMENT_PARSE_SELF),
  asyncHandler(async (req, res) => {
    const body = parseBody(ParseRequestSchema, req.body);

    if (body.files.length === 0) {
      throw badRequest('Se requieren archivos (files: [{ name, base64 }])');
    }

    const documents: Array<{ name: string; text: string }> = [];

    for (const file of body.files.slice(0, 5)) {
      const buffer = Buffer.from(file.base64, 'base64');
      const text = await parseTransactionFile(buffer, file.name);
      documents.push({ name: file.name, text });
    }

    return sendSuccess(res, { documents });
  }),
);

export default router;
