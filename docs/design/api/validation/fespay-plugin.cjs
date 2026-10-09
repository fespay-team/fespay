// OpenAPI 3.1のHTTP表現を維持し、FesPay固有のブラウザー遷移とSSE参照を検証する。
const googleCallback = '#/paths/~1v1~1auth~1google~1callback/get';
const resolve = (node, ctx) => node ? ctx.resolve(node).node : undefined;

function operationSuccessResponse() {
  return {
    Operation(operation, ctx) {
      const responses = operation.responses || {};
      const has2xx = Object.keys(responses).some((code) => /^2(?:\d{2}|XX)$/.test(code));
      if (ctx.location.pointer !== googleCallback) {
        if (!has2xx) {
          ctx.report({
            message: 'Operation must have at least one 2XX response; only GET /v1/auth/google/callback uses a 302 redirect.',
            location: ctx.location.child('responses'),
          });
        }
        return;
      }

      if (operation.operationId !== 'finishGoogleAuthentication' || !responses['302'] || has2xx) {
        ctx.report({
          message: 'Google callback must finish browser navigation with a 302 response, without a fictional 2XX response.',
          location: ctx.location.child('responses'),
        });
      }
      const redirect = resolve(responses['302'], ctx);
      const headers = redirect?.headers || {};
      const location = resolve(headers.Location, ctx);
      const cacheControl = resolve(headers['Cache-Control'], ctx);
      if (location?.required !== true || location?.schema?.$ref !== '#/components/schemas/ReturnPath') {
        ctx.report({
          message: 'Google callback 302 requires Location with the same-origin ReturnPath schema.',
          location: ctx.location.child(['responses', '302', 'headers']),
        });
      }
      const cacheSchema = resolve(cacheControl?.schema, ctx);
      if (cacheSchema?.const !== 'no-store') {
        ctx.report({
          message: 'Google callback 302 requires Cache-Control: no-store.',
          location: ctx.location.child(['responses', '302', 'headers']),
        });
      }
    },
  };
}

module.exports = function fespayPlugin() {
  return {
    id: 'fespay',
    typeExtension: {
      oas3(types) {
        return {
          ...types,
          EventDataSchemas: {
            properties: {
              'resource.changed': 'Schema',
              resync: 'Schema',
            },
            required: ['resource.changed', 'resync'],
            additionalProperties: false,
          },
          Operation: {
            ...types.Operation,
            properties: {
              ...types.Operation.properties,
              'x-event-data-schemas': 'EventDataSchemas',
              'x-query-schema': 'Schema',
            },
          },
        };
      },
    },
    rules: {
      oas3: {
        'operation-success-response': operationSuccessResponse,
      },
    },
  };
};
