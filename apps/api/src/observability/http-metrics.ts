type HttpMetricPoint = {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
};

type HttpRouteStats = {
  method: string;
  route: string;
  totalRequests: number;
  success2xx: number;
  client4xx: number;
  server5xx: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
};

const MAX_POINTS_PER_ROUTE = 1000;
const HTTP_POINTS = new Map<string, HttpMetricPoint[]>();

function routeKey(method: string, route: string): string {
  return `${method.toUpperCase()} ${route}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx] ?? 0;
}

export function recordHttpMetric(point: HttpMetricPoint): void {
  const key = routeKey(point.method, point.route);
  const bucket = HTTP_POINTS.get(key) ?? [];
  bucket.push(point);
  if (bucket.length > MAX_POINTS_PER_ROUTE) {
    bucket.shift();
  }
  HTTP_POINTS.set(key, bucket);
}

export function getHttpStatsByRoute(method: string, route: string): HttpRouteStats | null {
  const key = routeKey(method, route);
  const bucket = HTTP_POINTS.get(key);
  if (!bucket || bucket.length === 0) return null;

  const latencies = bucket.map((item) => item.durationMs).sort((a, b) => a - b);
  const success2xx = bucket.filter((item) => item.statusCode >= 200 && item.statusCode < 300).length;
  const client4xx = bucket.filter((item) => item.statusCode >= 400 && item.statusCode < 500).length;
  const server5xx = bucket.filter((item) => item.statusCode >= 500).length;

  return {
    method: method.toUpperCase(),
    route,
    totalRequests: bucket.length,
    success2xx,
    client4xx,
    server5xx,
    avgLatencyMs: Math.round(latencies.reduce((sum, n) => sum + n, 0) / latencies.length),
    p95LatencyMs: percentile(latencies, 0.95),
    p99LatencyMs: percentile(latencies, 0.99),
  };
}

export function getAllHttpStats(): HttpRouteStats[] {
  const out: HttpRouteStats[] = [];
  for (const [key] of HTTP_POINTS.entries()) {
    const separator = key.indexOf(' ');
    const method = key.slice(0, separator);
    const route = key.slice(separator + 1);
    const stats = getHttpStatsByRoute(method, route);
    if (stats) out.push(stats);
  }
  return out.sort((a, b) => b.totalRequests - a.totalRequests);
}

export function getHttpGlobalStats() {
  const all = getAllHttpStats();
  const totalRequests = all.reduce((sum, item) => sum + item.totalRequests, 0);
  const totalServerErrors = all.reduce((sum, item) => sum + item.server5xx, 0);
  const totalClientErrors = all.reduce((sum, item) => sum + item.client4xx, 0);
  const weightedLatency =
    totalRequests > 0
      ? Math.round(
          all.reduce((sum, item) => sum + item.avgLatencyMs * item.totalRequests, 0) / totalRequests,
        )
      : 0;

  return {
    totalEndpoints: all.length,
    totalRequests,
    totalClientErrors,
    totalServerErrors,
    avgLatencyMs: weightedLatency,
  };
}

export function clearHttpMetrics(): void {
  HTTP_POINTS.clear();
}
