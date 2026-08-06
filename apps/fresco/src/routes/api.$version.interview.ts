import { createFileRoute } from '@tanstack/react-router';

import { verifyApiToken } from '~/lib/apiTokens';
import { prisma } from '~/lib/db';
import { type Prisma } from '~/lib/db/generated/client';
import { captureException, shutdownPostHog } from '~/lib/posthog-server';
import { getAppSetting } from '~/queries/appSettings';
import {
  createCorsHeaders,
  createVersionedHandler,
} from '~/src/server/apiVersioning';
import { ensureError } from '~/utils/ensureError';

/**
 * `app/api/[version]/interview/route.ts`. The URL, the search-param names, the
 * response envelope and the CORS headers are contract: researchers script
 * against this endpoint (`docs/example-api-query.{R,py}`).
 *
 * `[version]` becomes `$version`. `after()` for the PostHog flush becomes plain
 * fire-and-forget — see spike S4.
 */

const corsHeaders = createCorsHeaders('GET, OPTIONS');

async function v1(request: Request) {
  const enabled = await getAppSetting('enableInterviewDataApi');
  if (!enabled) {
    return Response.json(
      { error: 'Interview Data API is not enabled' },
      { status: 403, headers: corsHeaders },
    );
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token || !(await verifyApiToken(token)).valid) {
    return Response.json(
      { error: 'Authentication required. Provide a Bearer token.' },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const perPage = Math.min(
      100,
      Math.max(1, Number(searchParams.get('perPage') ?? '10')),
    );
    const protocolId = searchParams.get('protocolId');
    const participantId = searchParams.get('participantId');
    const status = searchParams.get('status');

    const where: Prisma.InterviewWhereInput = {};

    if (protocolId) {
      where.protocolId = protocolId;
    }

    if (participantId) {
      where.participantId = participantId;
    }

    if (status === 'completed') {
      where.finishTime = { not: null };
    } else if (status === 'in-progress') {
      where.finishTime = null;
    }

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        select: {
          id: true,
          startTime: true,
          finishTime: true,
          lastUpdated: true,
          currentStep: true,
          protocolId: true,
          participantId: true,
          participant: {
            select: {
              id: true,
              identifier: true,
              label: true,
            },
          },
          protocol: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { lastUpdated: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.interview.count({ where }),
    ]);

    return Response.json(
      {
        data: interviews,
        meta: {
          page,
          perPage,
          pageCount: Math.ceil(total / perPage),
          total,
        },
      },
      { headers: corsHeaders },
    );
  } catch (e) {
    const error = ensureError(e);
    await captureException(error);
    void shutdownPostHog();

    return Response.json(
      { error: 'Failed to fetch interviews' },
      { status: 500, headers: corsHeaders },
    );
  }
}

const handleGet = createVersionedHandler({ v1: { GET: v1 } }, 'GET');

export const Route = createFileRoute('/api/$version/interview')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleGet(request, params.version),
      OPTIONS: () => new Response(null, { status: 204, headers: corsHeaders }),
    },
  },
});
