import { Router } from 'express';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { resolve, normalize } from 'path';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth';
import { getSimulationArtifactsDir } from '../services/simulations/simulation.service';
import { asyncHandler } from '../middleware/errorHandler';
import { badRequest, notFound } from '../http/api.errors';
import { PERMISSIONS } from '../auth/rbac';
import { parseQuery } from '../http/parse';
import { documentsRateLimiter } from '../http/rate-limit.policy';

const router = Router();

const PdfServeQuerySchema = z.object({
  file: z.string().min(1),
});

const PdfDeleteQuerySchema = z.object({
  file: z.string().min(1),
  previewFile: z.string().min(1).optional(),
});

function assertSafeArtifactPath(userDir: string, filename: string) {
  if (!filename.endsWith('.pdf') && !filename.endsWith('.png')) {
    throw badRequest('Only PDF and PNG files are allowed');
  }

  if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.startsWith('.')) {
    throw badRequest('Invalid file path');
  }

  const filePath = resolve(userDir, filename);
  const normalizedUserDir = normalize(userDir) + '/';
  if (!filePath.startsWith(normalizedUserDir) && filePath !== normalize(userDir)) {
    throw badRequest('Invalid file path');
  }

  return filePath;
}

/**
 * GET /api/pdfs/serve?file={filename}
 * Serves PDF and PNG files from per-user simulation artifacts directory.
 */
router.get(
  '/serve',
  requireAuth,
  documentsRateLimiter, // SECURITY: Prevent DoS via large file downloads
  requirePermission(PERMISSIONS.PROFILE_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user?.id) {
      throw notFound('User not found');
    }

    const { file: filename } = parseQuery(PdfServeQuerySchema, req.query);

    const userDir = getSimulationArtifactsDir(user.id);
    const filePath = assertSafeArtifactPath(userDir, filename);

    try {
      const fileBuffer = readFileSync(filePath);
      const contentType = filename.endsWith('.pdf') ? 'application/pdf' : 'image/png';

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      });

      return res.send(fileBuffer);
    } catch {
      throw notFound('File not found');
    }
  }),
);

/**
 * DELETE /api/pdfs/delete?file={filename}&previewFile={filename?}
 * Deletes a report artifact and its preview image if present.
 */
router.delete(
  '/delete',
  requireAuth,
  requirePermission(PERMISSIONS.PROFILE_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user?.id) {
      throw notFound('User not found');
    }

    const { file: filename, previewFile } = parseQuery(PdfDeleteQuerySchema, req.query);
    const userDir = getSimulationArtifactsDir(user.id);
    const targets = new Set<string>([filename, previewFile].filter(Boolean) as string[]);

    if (filename.endsWith('.pdf')) {
      targets.add(filename.replace(/\.pdf$/i, '.png'));
    } else if (filename.endsWith('.png')) {
      targets.add(filename.replace(/\.png$/i, '.pdf'));
    }

    for (const target of targets) {
      const filePath = assertSafeArtifactPath(userDir, target);
      if (!existsSync(filePath)) continue;
      try {
        unlinkSync(filePath);
      } catch {
        // Best effort delete; do not fail the request if a sibling was already removed.
      }
    }

    return res.json({ deleted: true });
  }),
);

export const pdfsRouter = router;
