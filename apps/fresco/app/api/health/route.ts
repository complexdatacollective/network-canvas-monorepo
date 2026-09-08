import { type NextRequest, NextResponse } from 'next/server';

import { env } from '~/env.js';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

type HealthCheck = {
  name: string;
  status: HealthStatus;
  duration: number;
  error?: string;
};

// Reported only when the deployer opts in; see getHealthDetails.
type HealthDetails = {
  uptime: number;
  version: string;
};

type HealthResponse = Partial<HealthDetails> & {
  status: HealthStatus;
  timestamp: string;
  checks: HealthCheck[];
};

// This endpoint is unauthenticated so that load balancers and container
// orchestrators can probe it, and a liveness probe needs nothing beyond the
// status. The running version tells an anonymous caller which published
// vulnerabilities apply to this instance, and the process uptime whether a
// fix has been deployed yet, so neither is reported unless the deployer opts
// in with EXPOSE_HEALTH_DETAILS=true (the release-test harness does, to bind
// the stack under test to the build it certifies). The Node.js version and
// NODE_ENV are never reported.
function getHealthDetails(): Partial<HealthDetails> {
  if (!env.EXPOSE_HEALTH_DETAILS) return {};

  return {
    uptime: Math.round(process.uptime()),
    version: env.APP_VERSION ?? 'unknown',
  };
}

function checkBasicHealth(): HealthCheck {
  const start = performance.now();

  try {
    // Basic health check - just verify the service is running.
    const duration = performance.now() - start;

    return {
      name: 'basic',
      status: 'healthy',
      duration: Math.round(duration),
    };
  } catch (error) {
    const duration = performance.now() - start;

    return {
      name: 'basic',
      status: 'unhealthy',
      duration: Math.round(duration),
      error:
        error instanceof Error ? error.message : 'Basic health check failed',
    };
  }
}

function getOverallStatus(checks: HealthCheck[]): HealthStatus {
  const hasUnhealthy = checks.some((check) => check.status === 'unhealthy');
  const hasDegraded = checks.some((check) => check.status === 'degraded');

  if (hasUnhealthy) return 'unhealthy';
  if (hasDegraded) return 'degraded';
  return 'healthy';
}

function getStatusCode(status: HealthStatus): number {
  switch (status) {
    case 'healthy':
      return 200;
    case 'degraded':
      return 200; // Still operational
    case 'unhealthy':
      return 503; // Service Unavailable
  }
}

export function GET(_request: NextRequest): NextResponse {
  const startTime = performance.now();

  try {
    // Run health checks
    const basicCheck = checkBasicHealth();
    const checks = [basicCheck];

    const overallStatus = getOverallStatus(checks);
    const statusCode = getStatusCode(overallStatus);

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      ...getHealthDetails(),
      checks,
    };

    const totalDuration = Math.round(performance.now() - startTime);

    return NextResponse.json(
      {
        ...response,
        duration: totalDuration,
      },
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Health-Check': 'true',
        },
      },
    );
  } catch (error) {
    // Fallback error response
    const response: HealthResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: [
        {
          name: 'health_check',
          status: 'unhealthy',
          duration: Math.round(performance.now() - startTime),
          error: error instanceof Error ? error.message : 'Health check failed',
        },
      ],
    };

    return NextResponse.json(response, {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'true',
      },
    });
  }
}
