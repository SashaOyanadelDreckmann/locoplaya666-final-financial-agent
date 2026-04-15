import crypto from 'crypto';

type TraceHandle = {
  traceId: string;
  spanId: string;
  end: (input: { statusCode: number; durationMs: number; error?: unknown }) => void;
};

type OtelSpanLike = {
  setAttribute?: (key: string, value: string | number | boolean) => void;
  recordException?: (error: unknown) => void;
  setStatus?: (input: { code: number; message?: string }) => void;
  end: () => void;
};

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

function parseTraceparentHeader(traceparent?: string | string[]): { traceId: string; parentSpanId?: string } | null {
  const value = Array.isArray(traceparent) ? traceparent[0] : traceparent;
  if (!value) return null;
  const parts = value.trim().split('-');
  if (parts.length < 4) return null;
  const [, traceId, spanId] = parts;
  if (!/^[a-f0-9]{32}$/i.test(traceId)) return null;
  if (!/^[a-f0-9]{16}$/i.test(spanId)) return null;
  return { traceId: traceId.toLowerCase(), parentSpanId: spanId.toLowerCase() };
}

function tryLoadOtelApi():
  | {
      trace: {
        getTracer: (name: string) => {
          startSpan: (name: string) => OtelSpanLike;
        };
      };
      SpanStatusCode?: { ERROR?: number; OK?: number };
    }
  | null {
  try {
    const unsafeRequire = (Function('return require')() as NodeRequire);
    return unsafeRequire('@opentelemetry/api');
  } catch {
    return null;
  }
}

export function startHttpTrace(input: {
  method: string;
  route: string;
  correlationId: string;
  traceparent?: string | string[];
}): TraceHandle {
  const parsed = parseTraceparentHeader(input.traceparent);
  const traceId = parsed?.traceId ?? randomHex(16);
  const spanId = randomHex(8);

  const otelApi = tryLoadOtelApi();
  const span: OtelSpanLike | null = otelApi
    ? otelApi.trace.getTracer('financial-agent-api').startSpan(`${input.method} ${input.route}`)
    : null;

  if (span?.setAttribute) {
    span.setAttribute('http.method', input.method);
    span.setAttribute('http.route', input.route);
    span.setAttribute('app.correlation_id', input.correlationId);
    span.setAttribute('app.trace_id', traceId);
    span.setAttribute('app.span_id', spanId);
  }

  return {
    traceId,
    spanId,
    end: ({ statusCode, durationMs, error }) => {
      if (!span) return;

      if (span.setAttribute) {
        span.setAttribute('http.status_code', statusCode);
        span.setAttribute('http.server_duration_ms', durationMs);
      }
      if (error && span.recordException) {
        span.recordException(error);
      }
      if (span.setStatus && otelApi?.SpanStatusCode) {
        span.setStatus({
          code:
            statusCode >= 500
              ? (otelApi.SpanStatusCode.ERROR ?? 2)
              : (otelApi.SpanStatusCode.OK ?? 1),
          ...(statusCode >= 500 ? { message: 'server_error' } : {}),
        });
      }
      span.end();
    },
  };
}
