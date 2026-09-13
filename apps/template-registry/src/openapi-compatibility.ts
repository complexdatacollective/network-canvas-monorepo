import type { OpenAPIDocument } from '@orpc/openapi';

const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';

/**
 * Derive the compatibility document from the normative OpenAPI 3.1 contract.
 * Keep this conversion deliberately small: every rewrite corresponds to JSON
 * Schema 2020-12 syntax emitted by the installed Zod converter that OpenAPI
 * 3.0 tooling cannot consume.
 */
export type OpenApi30Document = Record<string, unknown> & {
  openapi: '3.0.3';
  info: Record<string, unknown>;
};

export function toOpenApi30(document: OpenAPIDocument): OpenApi30Document {
  const compatible = requiredRecord(convert(document));
  compatible.openapi = '3.0.3';
  const info = requiredRecord(compatible.info);
  compatible.info = info;
  info.license = {
    name: 'CC0-1.0',
    url: CC0_URL,
  };
  // This converter-only sentinel is not referenced by any operation. Zod uses
  // `const: false` to represent `undefined`; OpenAPI 3.0 has no equivalent and
  // client generators otherwise report a partially generated client.
  const components = optionalRecord(compatible.components);
  const schemas = optionalRecord(components?.schemas);
  if (schemas) delete schemas.UndefinedError;
  const paths = optionalRecord(compatible.paths);
  const artifactPath = optionalRecord(paths?.['/artifacts/{root}']);
  const artifact = optionalRecord(artifactPath?.get);
  const responses = optionalRecord(artifact?.responses);
  const response = optionalRecord(responses?.['200']);
  if (response && !('$ref' in response)) {
    const content = optionalRecord(response.content);
    const media = optionalRecord(
      content?.['application/vnd.networkcanvas.template+zip'],
    );
    if (media) {
      delete content?.['application/vnd.networkcanvas.template+zip'];
      response.content = {
        ...content,
        // Some 3.0 generators recognize binary payloads only under this
        // standard media type. Preserve the runtime media type explicitly.
        'application/octet-stream': {
          ...media,
          'x-runtime-content-type':
            'application/vnd.networkcanvas.template+zip',
        },
      };
    }
  }
  return { ...compatible, openapi: '3.0.3', info };
}

function convert(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(convert);
  if (!isRecord(value)) return value;

  const converted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'contentEncoding' || key === 'contentMediaType') continue;
    if (key === 'const') {
      converted.enum = [convert(child)];
      continue;
    }
    if (
      (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') &&
      typeof child === 'number'
    ) {
      converted[key === 'exclusiveMinimum' ? 'minimum' : 'maximum'] = child;
      converted[key] = true;
      continue;
    }
    converted[key] = convert(child);
  }

  const alternatives = converted.anyOf;
  if (!Array.isArray(alternatives)) return converted;
  const nonNull = alternatives.filter(
    (alternative) => !isRecord(alternative) || alternative.type !== 'null',
  );
  if (nonNull.length === alternatives.length) return converted;

  delete converted.anyOf;
  if (nonNull.length !== 1)
    return { ...converted, anyOf: nonNull, nullable: true };
  const schema = nonNull[0];
  if (isRecord(schema) && Object.keys(schema).length === 1 && '$ref' in schema)
    return { ...converted, allOf: [schema], nullable: true };
  if (!isRecord(schema)) return { ...converted, nullable: true };
  return { ...converted, ...schema, nullable: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('REGISTRY_OPENAPI_SHAPE_INVALID');
  return value;
}
