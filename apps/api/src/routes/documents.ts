/**
 * Ingiere documentos PDF/Excel/CSV/imagen subidos desde el chat.
 * Retorna texto extraído y deja memoria documental buscable por usuario.
 */

import { Router } from 'express';
import { z } from 'zod';
import { ingestUserDocument, searchUserDocumentContext } from '../services/document-intelligence.service';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { badRequest, unauthorized } from '../http/api.errors';
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
        mimeType: z.string().optional(),
      }),
    )
    .min(1)
    .max(5),
});

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

router.post(
  '/parse',
  requireAuth,
  requirePermission(PERMISSIONS.DOCUMENT_PARSE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Authentication required');

    const body = parseBody(ParseRequestSchema, req.body);

    if (body.files.length === 0) {
      throw badRequest('Se requieren archivos (files: [{ name, base64 }])');
    }

    const documents: Array<{
      documentId: string;
      name: string;
      text: string;
      summary: unknown;
      structuredData: unknown;
      indexed: boolean;
    }> = [];

    for (const file of body.files.slice(0, 5)) {
      const buffer = Buffer.from(file.base64, 'base64');
      const document = await ingestUserDocument({
        userId: user.id,
        name: file.name,
        buffer,
        mimeType: file.mimeType,
      });
      documents.push(document);
    }

    return sendSuccess(res, {
      documents,
      indexed: documents.filter((doc) => doc.indexed).length,
    });
  }),
);

router.get(
  '/search',
  requireAuth,
  requirePermission(PERMISSIONS.DOCUMENT_PARSE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Authentication required');

    const query = SearchQuerySchema.parse(req.query);
    const results = await searchUserDocumentContext(user.id, query.q, query.limit ?? 6);
    return sendSuccess(res, { results });
  }),
);

export default router;
