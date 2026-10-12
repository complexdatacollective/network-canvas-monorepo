import { HttpApi, HttpApiSecurity, OpenApi } from 'effect/http-api';

import { StatusApiGroup } from './groups/status.ts';

export const API_V1_PATH = '/api/v1';

export const StudioApi = HttpApi.make('studio-v1')
  .add(StatusApiGroup)
  .annotate(OpenApi.Title, 'Network Canvas Studio API')
  .annotate(OpenApi.Version, 'v1')
  .annotate(OpenApi.Servers, [{ url: API_V1_PATH }]);

export const openApiDocument = () => OpenApi.fromApi(StudioApi);

export const ScopedToken = HttpApiSecurity.bearer;
