import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';

import { NotFoundResponse } from '../../schema/errors.ts';
import { PublicInstanceStatus } from '../../schema/status.ts';

export const StatusApiGroup = HttpApiGroup.make('status').add(
  HttpApiEndpoint.get('get', '/status', {
    success: PublicInstanceStatus,
    error: NotFoundResponse,
  })
    .annotate(OpenApi.Identifier, 'status')
    .annotate(OpenApi.Summary, 'Instance status'),
);
