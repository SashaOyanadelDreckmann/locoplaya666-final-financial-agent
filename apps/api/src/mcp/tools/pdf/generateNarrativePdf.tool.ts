import { z } from 'zod';
import type { MCPTool } from '../types';
import { generateProfessionalReportPdf } from '../../../services/reports/professionalPdf.service';
import {
  timeoutError,
  wrapError,
} from '../../security/error';
import { checkRateLimit } from '../../security/rate-limiter';
import {
  validateArrayLength,
  sanitizeString,
} from '../../security/input-sanitizer';
import {
  createMetricsCollector,
  recordToolMetrics,
} from '../../security/telemetry';

const TOOL_NAME = 'pdf.generate_report';
const TIMEOUT_MS = 30000; // 30 seconds
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB

export const generateNarrativePdfTool: MCPTool = {
  name: TOOL_NAME,
  description:
    'Genera un PDF narrativo profesional, no basado en simulación. Timeout: 30s, max size: 10MB.',

  argsSchema: z.object({
    title: z.string().min(3),
    subtitle: z.string().optional(),
    style: z.enum(['corporativo', 'minimalista', 'tecnico', 'premium_dark']).optional(),
    source: z.enum(['analysis', 'diagnostic', 'simulation']).optional(),
    sections: z
      .array(
        z.object({
          heading: z.string().min(2),
          body: z.string().min(8),
        })
      )
      .optional(),
    tables: z
      .array(
        z.object({
          title: z.string().min(2),
          columns: z.array(z.string()).min(1),
          rows: z.array(z.array(z.union([z.string(), z.number()]))).default([]),
          align: z.array(z.enum(['left', 'center', 'right'])).optional(),
        })
      )
      .optional(),
    charts: z
      .array(
        z.object({
          title: z.string().min(2),
          subtitle: z.string().optional(),
          kind: z.enum(['line', 'bar', 'area']).optional(),
          labels: z.array(z.string()).min(1),
          values: z.array(z.number()).min(1),
        })
      )
      .optional(),
  }),

  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      style: { type: 'string', enum: ['corporativo', 'minimalista', 'tecnico', 'premium_dark'] },
      source: { type: 'string', enum: ['analysis', 'diagnostic', 'simulation'] },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['heading', 'body'],
        },
      },
      tables: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            columns: { type: 'array', items: { type: 'string' } },
            rows: {
              type: 'array',
              items: {
                type: 'array',
                items: {
                  anyOf: [{ type: 'string' }, { type: 'number' }],
                },
              },
            },
            align: {
              type: 'array',
              items: { type: 'string', enum: ['left', 'center', 'right'] },
            },
          },
          required: ['title', 'columns', 'rows'],
        },
      },
      charts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            subtitle: { type: 'string' },
            kind: { type: 'string', enum: ['line', 'bar', 'area'] },
            labels: { type: 'array', items: { type: 'string' } },
            values: { type: 'array', items: { type: 'number' } },
          },
          required: ['title', 'labels', 'values'],
        },
      },
    },
    required: ['title'],
  },

  run: async (args, { user_id } = {}) => {
    const metrics = createMetricsCollector(TOOL_NAME);

    try {
      // 1. Rate limiting check
      const limiterUserId = user_id || 'anonymous';
      checkRateLimit(limiterUserId, TOOL_NAME);

      // 2. Input validation
      const title = sanitizeString(args.title, { min: 3, max: 200 });
      const subtitle = args.subtitle
        ? sanitizeString(args.subtitle, { max: 200 })
        : undefined;

      // 3. Validate array sizes
      if (args.sections) {
        validateArrayLength(args.sections, 50, 'sections');
        for (const section of args.sections) {
          sanitizeString(section.heading, { min: 2, max: 200 });
          sanitizeString(section.body, { min: 8, max: 5000 });
        }
      }

      if (args.tables) {
        validateArrayLength(args.tables, 20, 'tables');
        for (const table of args.tables) {
          sanitizeString(table.title, { min: 2, max: 200 });
          validateArrayLength(table.columns, 20, 'table.columns');
          validateArrayLength(table.rows, 1000, 'table.rows');
        }
      }

      if (args.charts) {
        validateArrayLength(args.charts, 20, 'charts');
        for (const chart of args.charts) {
          sanitizeString(chart.title, { min: 2, max: 200 });
          validateArrayLength(chart.labels, 100, 'chart.labels');
          validateArrayLength(chart.values, 100, 'chart.values');
        }
      }

      // 4. Execute with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        TIMEOUT_MS
      );

      let artifact: any;
      try {
        artifact = await Promise.race([
          generateProfessionalReportPdf({
            title,
            subtitle,
            style: args.style,
            source: args.source,
            sections: args.sections,
            tables: args.tables,
            charts: args.charts,
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

      // 5. Validate output size
      const outputSize = JSON.stringify(artifact).length;
      if (outputSize > MAX_OUTPUT_SIZE) {
        throw new Error(
          `PDF generation exceeded size limit: ${outputSize} > ${MAX_OUTPUT_SIZE}`
        );
      }

      // 6. Record metrics
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
