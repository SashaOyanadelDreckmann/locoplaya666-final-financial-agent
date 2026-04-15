import { Router } from 'express';
import { readFileSync } from 'fs';
import { join, resolve, normalize } from 'path';
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

    // SECURITY: Strict path validation to prevent traversal attacks
    if (!filename.endsWith('.pdf') && !filename.endsWith('.png')) {
      throw badRequest('Only PDF and PNG files are allowed');
    }

    // SECURITY: Validate filename doesn't contain path separators or traversal patterns
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.startsWith('.')) {
      throw badRequest('Invalid file path');
    }

    const userDir = getSimulationArtifactsDir(user.id);
    const filePath = resolve(userDir, filename);

    // SECURITY: Ensure resolved path is within user's directory (prevents symlink traversal)
    if (!filePath.startsWith(normalize(userDir))) {
      throw badRequest('Invalid file path');
    }

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

export const pdfsRouter = router;
