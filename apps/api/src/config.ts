/**
 * config.ts
 *
 * Environment variable validation and configuration.
 * Validates at startup to fail fast on misconfiguration.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { z, ZodError } from 'zod';

let envPath = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(process.cwd(), '.env');
}
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(process.cwd(), 'apps/api/.env');
}
dotenv.config({ path: envPath });

const configSchema = z.object({
  // LLM - OpenAI (core brain)
  OPENAI_API_KEY: z.string().default('test-openai-key'),
  OPENAI_MODEL: z
    .string()
    .default('gpt-5.2')
    .describe('OpenAI model for core agent chart/table MCP tool loop'),
  OPENAI_TEMPERATURE: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 0.6))
    .describe('Temperature for OpenAI LLM (0-1)'),

  // LLM - Claude (final frontend report)
  ANTHROPIC_API_KEY: z.string().default('test-anthropic-key'),
  ANTHROPIC_MODEL: z
    .string()
    .default('claude-sonnet-4-6')
    .describe('Anthropic model ID (claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5)'),
  ANTHROPIC_MODEL_FAST: z
    .string()
    .optional()
    .transform((v) => (v?.trim() || 'claude-haiku-4-5'))
    .describe('Cheap Anthropic model for budget chat and other fast paths'),
  ANTHROPIC_TEMPERATURE: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 0.6))
    .describe('Temperature for LLM (0-1)'),

  // Web Server
  PORT: z
    .string()
    .default('3001')
    .transform((v) => Number(v))
    .describe('Server port'),
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .describe('Frontend origin for CORS'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development')
    .describe('Environment mode'),

  // Sessions
  SESSION_TTL_DAYS: z
    .string()
    .default('7')
    .transform((v) => Number(v))
    .describe('Session TTL in days'),
  SESSION_TOKEN_SECRET: z
    .string()
    .min(32, 'SESSION_TOKEN_SECRET must be at least 32 characters')
    .describe('HMAC secret for hashing session tokens (min 32 chars, REQUIRED in production)'),
  SESSION_COOKIE_NAME: z
    .string()
    .default('session')
    .describe('Cookie name used to store session token'),
  SESSION_COOKIE_SAME_SITE: z
    .enum(['lax', 'strict', 'none'])
    .default('lax')
    .describe('Cookie SameSite policy'),
  SESSION_COOKIE_DOMAIN: z
    .string()
    .optional()
    .describe('Optional cookie domain'),
  SESSION_ROTATE_INTERVAL_MINUTES: z
    .string()
    .default('30')
    .transform((v) => Number(v))
    .describe('Minutes between automatic session rotations'),

  // Storage
  DATA_DIR: z
    .string()
    .default('./data')
    .describe('Directory for user data and profiles'),
  DATABASE_URL: z
    .string()
    .optional()
    .describe('Postgres connection string. Required for Postgres persistence; memory mode is non-production only.'),

  // Dev Features
  ENABLE_DEV_INJECTION: z
    .string()
    .default('false')
    .transform((v) => v === 'true')
    .describe('Enable dev-only data injection endpoints'),
  DEV_ADMIN_TOKEN: z
    .string()
    .optional()
    .describe('Admin token for dev endpoints (required if ENABLE_DEV_INJECTION=true)'),

  // Logging (optional, defaults built-in)
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info')
    .describe('Pino log level'),

  // Approval flow and transactional email
  RESEND_API_KEY: z
    .string()
    .optional()
    .describe('Resend API key for account approval emails'),
  APPROVAL_ADMIN_EMAIL: z
    .string()
    .email()
    .default('sasha.oyanadel@ug.uchile.cl')
    .describe('Admin inbox that receives account approval requests'),
  APPROVAL_LINK_SECRET: z
    .string()
    .default('dev-approval-link-secret-change-me')
    .describe('HMAC secret for one-click account approval links'),
  PASSWORD_RESET_LINK_SECRET: z
    .string()
    .default('dev-password-reset-link-secret-change-me')
    .describe('HMAC secret for one-click password reset links'),
  APPROVAL_LINK_BASE_URL: z
    .string()
    .default('http://localhost:3001')
    .describe('Public API base URL used to build approval links'),
  APPROVAL_LINK_TTL_HOURS: z
    .string()
    .default('24')
    .transform((v) => Number(v))
    .describe('Expiration time in hours for approval links'),
  APPROVAL_EMAIL_FROM: z
    .string()
    .default('Financieramente <onboarding@resend.dev>')
    .describe('From header used in approval flow emails'),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

/**
 * Get validated configuration. Throws if validation fails.
 * Call once at startup in server.ts.
 */
export function getConfig(): Config {
  if (_config) return _config;

  try {
    _config = configSchema.parse(process.env);

    const prodEnv = process.env.NODE_ENV === 'production';

    const requireProductionValue = (name: keyof Config, options?: { minLength?: number; deny?: string[] }) => {
      if (!prodEnv) return;
      const raw = String(process.env[String(name)] ?? '').trim();
      if (!raw) {
        console.error(`❌ SECURITY ERROR: ${String(name)} must be set in production`);
        process.exit(1);
      }
      if (options?.minLength && raw.length < options.minLength) {
        console.error(
          `❌ SECURITY ERROR: ${String(name)} must be at least ${options.minLength} characters in production`,
        );
        process.exit(1);
      }
      if (options?.deny?.includes(raw)) {
        console.error(`❌ SECURITY ERROR: ${String(name)} uses an unsafe placeholder value in production`);
        process.exit(1);
      }
      if (raw.includes('localhost') || raw.includes('127.0.0.1')) {
        console.error(`❌ SECURITY ERROR: ${String(name)} cannot point to localhost in production`);
        process.exit(1);
      }
    };

    if (_config.NODE_ENV === 'production') {
      requireProductionValue('DATABASE_URL');
      requireProductionValue('WEB_ORIGIN');
      requireProductionValue('APPROVAL_LINK_BASE_URL');
      requireProductionValue('SESSION_TOKEN_SECRET', {
        minLength: 32,
        deny: ['dev-only-session-secret-change-me'],
      });
      requireProductionValue('APPROVAL_LINK_SECRET', {
        minLength: 32,
        deny: ['dev-approval-link-secret-change-me'],
      });
      requireProductionValue('PASSWORD_RESET_LINK_SECRET', {
        minLength: 32,
        deny: ['dev-password-reset-link-secret-change-me'],
      });
      if (_config.APPROVAL_LINK_SECRET === _config.PASSWORD_RESET_LINK_SECRET) {
        console.error('❌ SECURITY ERROR: approval and password-reset secrets must be different in production');
        process.exit(1);
      }
      if (!_config.OPENAI_API_KEY || _config.OPENAI_API_KEY.startsWith('test-')) {
        console.error('❌ SECURITY ERROR: OPENAI_API_KEY must be configured in production');
        process.exit(1);
      }
      if (!_config.ANTHROPIC_API_KEY || _config.ANTHROPIC_API_KEY.startsWith('test-')) {
        console.error('❌ SECURITY ERROR: ANTHROPIC_API_KEY must be configured in production');
        process.exit(1);
      }
    }

    return _config;
  } catch (err) {
    if (err instanceof ZodError) {
      console.error('❌ Configuration validation failed:');
      err.issues.forEach((e) => {
        const path = e.path.join('.');
        console.error(`  • ${path}: ${e.message}`);
      });
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Format configuration summary for logging (non-sensitive values only).
 * Call with logger in server.ts after initialization.
 */
export function formatConfigSummary(config: Config): string {
  const lines = [
    '━'.repeat(60),
    '📋 Configuration Summary',
    '━'.repeat(60),
    `  Environment: ${config.NODE_ENV}`,
    `  Core Brain (OpenAI): ${config.OPENAI_MODEL} (charts/tables MCP only)`,
    `  Core Agent (Claude Haiku): ${config.ANTHROPIC_MODEL_FAST}`,
    `  Budget Chat (Claude fast): ${config.ANTHROPIC_MODEL_FAST}`,
    `  Port: ${config.PORT}`,
    `  Web Origin: ${config.WEB_ORIGIN}`,
    `  Data Dir: ${config.DATA_DIR}`,
    `  Persistence: ${config.DATABASE_URL ? 'postgres' : 'memory'}`,
    `  Dev Injection: ${config.ENABLE_DEV_INJECTION ? '🔓 ENABLED' : '🔒 disabled'}`,
    `  Approval Email: ${config.RESEND_API_KEY?.trim() ? '✅ Resend configured' : '⚠️  RESEND_API_KEY missing'}`,
    `  Approval Links: ${config.APPROVAL_LINK_BASE_URL}`,
  ];

  if (config.ENABLE_DEV_INJECTION && config.NODE_ENV === 'production') {
    lines.push('  ⚠️  WARNING: Dev injection enabled in production!');
  }

  if (config.NODE_ENV === 'production' && !config.RESEND_API_KEY?.trim()) {
    lines.push('  ⚠️  WARNING: Approval emails disabled — manual approval required');
  }

  lines.push('━'.repeat(60));
  return lines.join('\n');
}
