# Signup Wizard - Integration Guide

Step-by-step guide to integrate the signup wizard with the real API backend.

## Prerequisites

1. Install dependencies:
```bash
pnpm install
```

2. Ensure the Fresco API package is properly configured at:
   - `/packages/fresco-api/src/procedures/wizard.ts`

## Step 1: Create API Client

Create an oRPC client for the wizard procedures:

```typescript
// apps/fresco-platform/src/lib/api-client.ts
import { createORPCClient } from '@orpc/client';
import { wizardRouter } from '@packages/fresco-api/procedures/wizard';

export const apiClient = createORPCClient<typeof wizardRouter>({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const wizardApi = apiClient.wizard;
```

## Step 2: Replace Mock API Functions

Update `/apps/fresco-platform/src/lib/wizard-api.ts`:

```typescript
import { apiClient } from './api-client';

export const wizardApi = {
  async checkSubdomain(subdomain: string) {
    const result = await apiClient.wizard.checkSubdomain.query({ subdomain });
    return result;
  },

  async createSession(email: string) {
    const result = await apiClient.wizard.createSession.mutate({ email });
    return result;
  },

  async updateSession(sessionId: string, step: number, data: Record<string, unknown>) {
    const result = await apiClient.wizard.updateSession.mutate({
      sessionId,
      step,
      data
    });
    return result;
  },

  async getSession(sessionId: string) {
    const result = await apiClient.wizard.getSession.query({ sessionId });
    return result;
  },

  async deployTenant(sessionId: string) {
    const result = await apiClient.wizard.deployTenant.mutate({ sessionId });
    return result;
  },

  async getDeploymentStatus(tenantId: string) {
    const result = await apiClient.wizard.getDeploymentStatus.query({ tenantId });
    return result;
  },
};
```

## Step 3: Configure Environment Variables

Add to `.env.local`:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Fresco Domain
NEXT_PUBLIC_FRESCO_DOMAIN=fresco.networkcanvas.com
```

Update subdomain preview in `step3-subdomain.tsx`:

```typescript
const fullUrl = subdomain
  ? `https://${subdomain}.${process.env.NEXT_PUBLIC_FRESCO_DOMAIN}`
  : "";
```

## Step 4: Add Error Handling

Wrap API calls with proper error handling:

```typescript
// apps/fresco-platform/src/lib/api-error-handler.ts
export class APIError extends Error {
  constructor(
    public message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export async function handleAPICall<T>(
  apiCall: () => Promise<T>
): Promise<T> {
  try {
    return await apiCall();
  } catch (error) {
    if (error instanceof Error) {
      throw new APIError(
        error.message,
        'API_ERROR',
        500
      );
    }
    throw new APIError('Unknown error occurred', 'UNKNOWN_ERROR');
  }
}
```

## Step 5: Implement Real-time Updates

For deployment status, use polling or WebSocket:

### Option A: Polling (Current Implementation)
Already implemented in `step5-deployment.tsx`. Adjust polling interval as needed:

```typescript
// Check status every 3 seconds
setTimeout(checkDeploymentStatus, 3000);
```

### Option B: WebSocket (Recommended for Production)

```typescript
// apps/fresco-platform/src/lib/deployment-websocket.ts
export function subscribeToDeployment(
  tenantId: string,
  onUpdate: (status: DeploymentStatus) => void
) {
  const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/deployment/${tenantId}`);

  ws.onmessage = (event) => {
    const status = JSON.parse(event.data);
    onUpdate(status);
  };

  return () => ws.close();
}
```

Update `step5-deployment.tsx`:

```typescript
useEffect(() => {
  const unsubscribe = subscribeToDeployment(tenantId, (status) => {
    // Update deployment status
    if (status.status === 'ACTIVE') {
      setDeploymentStatus('success');
      onSuccess();
    }
  });

  return unsubscribe;
}, [tenantId]);
```

## Step 6: Add Analytics Tracking

Track user progression through the wizard:

```typescript
// apps/fresco-platform/src/lib/analytics.ts
export const analytics = {
  trackStepCompleted(step: number, data?: Record<string, unknown>) {
    // Integration with your analytics provider
    console.log('Step completed:', step, data);
  },

  trackDeploymentStarted(sessionId: string) {
    console.log('Deployment started:', sessionId);
  },

  trackDeploymentCompleted(tenantId: string, subdomain: string) {
    console.log('Deployment completed:', tenantId, subdomain);
  },
};
```

Add to wizard components:

```typescript
// In signup-wizard.tsx
const handleStep1Next = async (stepData: Step1Data) => {
  updateStepData('step1', stepData);
  analytics.trackStepCompleted(1, { email: stepData.email });
  setCurrentStep(2);
};
```

## Step 7: Email Verification

Implement email verification flow:

```typescript
// apps/fresco-platform/src/lib/email-verification.ts
export async function sendVerificationEmail(email: string, userId: string) {
  const token = generateVerificationToken(userId);
  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;

  await apiClient.email.sendVerification.mutate({
    email,
    verificationUrl,
  });
}
```

Add verification page:

```typescript
// apps/fresco-platform/src/app/verify-email/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    }
  }, [token]);

  return <div>Verifying your email...</div>;
}
```

## Step 8: Session Management

Integrate with Better Auth for session management:

```typescript
// apps/fresco-platform/src/lib/auth.ts
import { betterAuth } from 'better-auth';

export const auth = betterAuth({
  // Configuration
});

// Update wizard to use Better Auth
export async function createUserAccount(email: string, password: string) {
  const { user, session } = await auth.signUp({
    email,
    password,
  });

  return { user, session };
}
```

## Step 9: Testing

### Unit Tests

```typescript
// apps/fresco-platform/src/components/signup/__tests__/step1.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Step1AccountCreation } from '../step1-account-creation';

describe('Step1AccountCreation', () => {
  it('validates email format', async () => {
    const onNext = jest.fn();
    render(<Step1AccountCreation onNext={onNext} />);

    const emailInput = screen.getByLabelText('Email Address');
    fireEvent.change(emailInput, { target: { value: 'invalid' } });

    // Assertions...
  });
});
```

### Integration Tests

```typescript
// apps/fresco-platform/src/components/signup/__tests__/wizard.integration.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignupWizard } from '../signup-wizard';

describe('SignupWizard Integration', () => {
  it('completes full signup flow', async () => {
    render(<SignupWizard />);

    // Fill step 1
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' }
    });
    // ...continue through all steps

    await waitFor(() => {
      expect(screen.getByText('Your Instance is Ready!')).toBeInTheDocument();
    });
  });
});
```

## Step 10: Production Checklist

Before deploying to production:

- [ ] Replace all mock API functions with real endpoints
- [ ] Configure environment variables
- [ ] Set up error monitoring (Sentry, etc.)
- [ ] Add analytics tracking
- [ ] Implement rate limiting
- [ ] Add CAPTCHA for bot protection
- [ ] Configure email service
- [ ] Set up WebSocket for real-time updates
- [ ] Add comprehensive error messages
- [ ] Test all edge cases
- [ ] Review security (HTTPS, CSP headers)
- [ ] Add loading states and optimistic updates
- [ ] Configure CDN for static assets
- [ ] Set up database backups
- [ ] Document deployment process

## Troubleshooting

### Issue: API calls failing
**Solution**: Check CORS configuration and API URL in environment variables

### Issue: Session not persisting
**Solution**: Verify localStorage is enabled and not in private/incognito mode

### Issue: Deployment status not updating
**Solution**: Check polling interval and WebSocket connection

### Issue: TypeScript errors
**Solution**: Ensure ~/* path alias is configured in tsconfig.json

## Support

For questions or issues:
- Check the README.md in /src/components/signup/
- Review API documentation in /packages/fresco-api/
- Contact the development team

## Additional Resources

- [oRPC Documentation](https://orpc.dev)
- [React Hook Form](https://react-hook-form.com)
- [Zustand](https://github.com/pmndrs/zustand)
- [Better Auth](https://better-auth.com)
- [Radix UI](https://radix-ui.com)
