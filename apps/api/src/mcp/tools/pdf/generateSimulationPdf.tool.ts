import { z } from 'zod';
import type { MCPTool } from '../types';
import { generateSimulationPdf } from '../../../services/simulations/simulation.service';
import {
  timeoutError,
  wrapError,
  validationError,
} from '../../security/error';
import { checkRateLimit } from '../../security/rate-limiter';
import {
  validateArrayLength,
  validateNumericRange,
  sanitizeString,
} from '../../security/input-sanitizer';
import {
  createMetricsCollector,
  recordToolMetrics,
} from '../../security/telemetry';

const TOOL_NAME = 'pdf.generate_simulation';
const TIMEOUT_MS = 30000; // 30 seconds
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB

export const generateSimulationPdfTool: MCPTool = {
  name: TOOL_NAME,
  description:
    'Genera un PDF de simulación financiera con gráfico. Timeout: 30s, max size: 10MB.',

  argsSchema: z.object({
    principal: z.number(),
    annualRate: z.number(),
    months: z.number().optional(),
    monthlyContribution: z.number().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    executiveSummary: z.string().optional(),
    keyFindings: z.array(z.string()).optional(),
    assumptions: z.array(z.string()).optional(),
    contextHighlights: z.array(z.string()).optional(),
  }),

  schema: {
    type: 'object',
    properties: {
      principal: { type: 'number' },
      annualRate: { type: 'number' },
      months: { type: 'number' },
      monthlyContribution: { type: 'number' },
      title: { type: 'string' },
      subtitle: { type: 'string' },
      executiveSummary: { type: 'string' },
      keyFindings: {
        type: 'array',
        items: { type: 'string' },
      },
      assumptions: {
        type: 'array',
        items: { type: 'string' },
      },
      contextHighlights: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['principal', 'annualRate'],
  },

  run: async (args, { user_id } = {}) => {
    const metrics = createMetricsCollector(TOOL_NAME);

    try {
      // 1. Rate limiting check
      const limiterUserId = user_id || 'anonymous';
      checkRateLimit(limiterUserId, TOOL_NAME);

      // 2. Numeric validation
      const principal = validateNumericRange(
        args.principal,
        0,
        999999999,
        'principal'
      );
      const annualRate = validateNumericRange(
        args.annualRate,
        -100,
        1000,
        'annualRate'
      );
      const months = validateNumericRange(
        args.months ?? 12,
        1,
        600,
        'months'
      );
      const monthlyContribution = validateNumericRange(
        args.monthlyContribution ?? 0,
        0,
        999999999,
        'monthlyContribution'
      );

      // 3. String validation
      const title = args.title
        ? sanitizeString(args.title, { min: 3, max: 200 })
        : undefined;
      const subtitle = args.subtitle
        ? sanitizeString(args.subtitle, { max: 200 })
        : undefined;
      const summary = args.executiveSummary
        ? sanitizeString(args.executiveSummary, { max: 5000 })
        : undefined;

      // 4. Array validation
      if (args.keyFindings) {
        validateArrayLength(args.keyFindings, 20, 'keyFindings');
        for (const finding of args.keyFindings) {
          if (typeof finding !== 'string') {
            throw validationError('keyFindings must contain strings');
          }
          sanitizeString(finding, { min: 1, max: 500 });
        }
      }

      if (args.assumptions) {
        validateArrayLength(args.assumptions, 20, 'assumptions');
        for (const assumption of args.assumptions) {
          if (typeof assumption !== 'string') {
            throw validationError('assumptions must contain strings');
          }
          sanitizeString(assumption, { min: 1, max: 500 });
        }
      }

      if (args.contextHighlights) {
        validateArrayLength(
          args.contextHighlights,
          20,
          'contextHighlights'
        );
        for (const highlight of args.contextHighlights) {
          if (typeof highlight !== 'string') {
            throw validationError(
              'contextHighlights must contain strings'
            );
          }
          sanitizeString(highlight, { min: 1, max: 500 });
        }
      }

      // 5. Execute with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        TIMEOUT_MS
      );

      let artifact: any;
      try {
        artifact = await Promise.race([
          generateSimulationPdf({
            principal,
            annualRate,
            months,
            monthlyContribution,
            title,
            subtitle,
            executiveSummary: summary,
            keyFindings: args.keyFindings,
            assumptions: args.assumptions,
            contextHighlights: args.contextHighlights,
          }, limiterUserId),
          new Promise((_, reject) =>
            controller.signal.addEventListener('abort', () =>
              reject(new Error('PDF generation timeout'))
            )
          ),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }

      // 6. Validate output size
      const outputSize = JSON.stringify(artifact).length;
      if (outputSize > MAX_OUTPUT_SIZE) {
        throw new Error(
          `PDF generation exceeded size limit: ${outputSize} > ${MAX_OUTPUT_SIZE}`
        );
      }

      // 7. Record metrics
      const metrics_result = metrics.recordSuccess();
      recordToolMetrics(metrics_result);

      return {
        tool_call: {
          tool: TOOL_NAME,
          args,
          status: 'success',
          result: { artifact_id: artifact.id, sizeBytes: outputSize },
        },
        data: artifact,
      };
    } catch (error) {
      // Handle timeout specifically
      if (error instanceof Error && error.message.includes('timeout')) {
        const toolError = timeoutError(TOOL_NAME, TIMEOUT_MS);
        const metrics_error = metrics.recordError(toolError.code);
        recordToolMetrics(metrics_error);
        throw toolError;
      }

      // Wrap other errors
      const toolError = wrapError(error, TOOL_NAME);
      const metrics_error = metrics.recordError(toolError.code);
      recordToolMetrics(metrics_error);
      throw toolError;
    }
  },
};
