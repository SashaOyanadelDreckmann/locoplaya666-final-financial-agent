// apps/api/src/routes/http.types.ts

export type HttpRequest<TBody = unknown> = {
  body: TBody;
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
};

export type HttpResponse = {
  status: (code: number) => HttpResponse;
  json: (data: unknown) => unknown;
};
