export type EndpointDefinition = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  hasSchemaValidation: boolean;
  hasTests: boolean;
  hasDocs: boolean;
  hasObservability: boolean;
};

export const ENDPOINT_MANIFEST: EndpointDefinition[] = [
  { method: 'POST', path: '/auth/register', hasSchemaValidation: true, hasTests: true, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/auth/login', hasSchemaValidation: true, hasTests: true, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/auth/logout', hasSchemaValidation: true, hasTests: true, hasDocs: true, hasObservability: true },
  { method: 'GET', path: '/auth/me', hasSchemaValidation: true, hasTests: true, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/intake/submit', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/conversation/next', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'GET', path: '/diagnosis/latest', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/api/inject-profile', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/api/inject-intake', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/api/remove-injected-intake', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/api/remove-injected-profile', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/api/agent', hasSchemaValidation: true, hasTests: true, hasDocs: true, hasObservability: true },
  { method: 'GET', path: '/api/session', hasSchemaValidation: true, hasTests: true, hasDocs: true, hasObservability: true },
  { method: 'GET', path: '/api/welcome', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'GET', path: '/api/sheets', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/api/sheets', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'GET', path: '/api/panel-state', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/api/panel-state', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/api/documents/parse', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'GET', path: '/api/pdfs/serve', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'GET', path: '/simulations', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'POST', path: '/simulations/:id/save', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
  { method: 'GET', path: '/health', hasSchemaValidation: true, hasTests: false, hasDocs: true, hasObservability: true },
];

export function getDodCoverage() {
  const total = ENDPOINT_MANIFEST.length;
  const schema = ENDPOINT_MANIFEST.filter((endpoint) => endpoint.hasSchemaValidation).length;
  const tests = ENDPOINT_MANIFEST.filter((endpoint) => endpoint.hasTests).length;
  const docs = ENDPOINT_MANIFEST.filter((endpoint) => endpoint.hasDocs).length;
  const observability = ENDPOINT_MANIFEST.filter((endpoint) => endpoint.hasObservability).length;

  return {
    total,
    schemaCoverage: schema / total,
    testsCoverage: tests / total,
    docsCoverage: docs / total,
    observabilityCoverage: observability / total,
  };
}
