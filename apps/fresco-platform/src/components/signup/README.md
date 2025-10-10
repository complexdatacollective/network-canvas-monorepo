# Signup Wizard

A comprehensive multi-step signup wizard for the Fresco Platform that guides users through account creation and tenant deployment.

## Overview

The signup wizard consists of 6 steps that collect user information, validate data, and deploy a new Fresco instance:

1. **Account Creation** - Email and password setup with strength validation
2. **Use Case Selection** - Understanding user intent with sandbox suggestions
3. **Subdomain Selection** - Real-time availability checking and conflict resolution
4. **Terms & Conditions** - Legal agreement and privacy policy acceptance
5. **Deployment Progress** - Real-time deployment status with error handling
6. **Success Confirmation** - Access credentials and quick start resources

## Architecture

### State Management

The wizard uses Zustand for state management with persistence:

- **Store**: `/src/lib/wizard-store.ts` - Centralized state with localStorage persistence
- **Types**: `/src/lib/wizard-types.ts` - TypeScript definitions and Zod schemas
- **API**: `/src/lib/wizard-api.ts` - Mock API functions (to be replaced with real API client)

### Components

Each step is a separate component in `/src/components/signup/`:

- `step1-account-creation.tsx` - Email/password form with strength indicator
- `step2-use-case.tsx` - Use case radio selection with sandbox suggestions
- `step3-subdomain.tsx` - Subdomain input with real-time availability checking
- `step4-terms.tsx` - Terms of service display and acceptance
- `step5-deployment.tsx` - Deployment progress with real-time updates
- `step6-success.tsx` - Success confirmation with quick start guide
- `signup-wizard.tsx` - Main wizard container with step navigation

### Validation

All forms use React Hook Form with Zod schema validation:

- Password requirements: 8+ chars, uppercase, lowercase, number
- Email format validation
- Subdomain format: 3-63 chars, lowercase alphanumeric with hyphens
- Terms acceptance validation

### UI Components

Built on @codaco/ui package with Radix UI primitives:

- **New components added**: RadioGroup, Progress, Checkbox
- Fully responsive and accessible
- Dark mode support
- Tailwind CSS styling with Fresco theme

## Usage

### Basic Implementation

```tsx
import { SignupWizard } from "~/components/signup";

export default function SignupPage() {
  return <SignupWizard />;
}
```

### API Integration

Replace mock functions in `/src/lib/wizard-api.ts` with real API calls:

```typescript
// Example: Replace mock checkSubdomain
import { api } from "~/lib/api-client";

export const wizardApi = {
  async checkSubdomain(subdomain: string) {
    return await api.wizard.checkSubdomain({ subdomain });
  },
  // ... other methods
};
```

### Customization

#### Modify Step Flow

Edit `/src/components/signup/signup-wizard.tsx` to change navigation:

```tsx
const handleStep1Next = async (stepData: Step1Data) => {
  updateStepData("step1", stepData);
  // Add custom logic here
  setCurrentStep(2);
};
```

#### Add/Remove Steps

1. Update `TOTAL_STEPS` constant
2. Add new step component
3. Add step rendering in wizard container
4. Update state management and types

#### Styling

Components use Tailwind CSS classes. To customize:

- Update theme in `/apps/fresco-platform/tailwind.config.js`
- Modify component classes directly
- Use className prop for overrides

## Features

### Step 1: Account Creation
- Email validation
- Password strength indicator with visual feedback
- Password confirmation with mismatch detection
- Show/hide password toggles
- Email verification notice

### Step 2: Use Case Selection
- Radio button group for use case options
- Conditional sandbox suggestion for testing/learning
- Optional text input for "Other" use case
- External link to sandbox environment

### Step 3: Subdomain Selection
- Real-time availability checking with debounce
- Format validation and requirements display
- Alternative suggestions on conflict
- URL preview with full domain
- Visual availability indicators

### Step 4: Terms & Conditions
- Scrollable terms display with formatted sections
- Mandatory agreement checkboxes
- Privacy policy and SLA links
- Form validation for required agreements

### Step 5: Deployment Progress
- Real-time deployment status tracking
- Animated progress indicators
- Estimated time remaining
- Detailed step-by-step progress
- Error handling with retry option
- Deployment target URL display

### Step 6: Success Confirmation
- Deployment confirmation message
- Access credentials with copy-to-clipboard
- Quick start guide with external resources
- Dashboard navigation
- Instance URL with direct access

## State Persistence

The wizard automatically persists state to localStorage:

- Session ID and data survive page refreshes
- Users can resume incomplete signups
- Cleared on successful deployment
- Configurable expiry time

## Error Handling

- Form validation errors displayed inline
- API errors caught and displayed to user
- Deployment failures trigger retry option
- Session expiry handled gracefully
- Network errors with user feedback

## Testing

Mock API functions simulate:
- Subdomain availability checking (reserved: admin, api, www, app, dashboard, mail, test)
- Session creation and management
- Deployment with random success/failure
- Deployment status polling

Replace with actual API integration for production.

## Dependencies

### Required Packages
- `react-hook-form` - Form management
- `@hookform/resolvers` - Zod integration
- `zod` - Schema validation
- `zustand` - State management
- `lucide-react` - Icons
- `@radix-ui/*` - UI primitives
- `@codaco/ui` - Shared UI components

### Optional Enhancements
- Email verification flow
- Social login integration
- Multi-language support
- Analytics tracking
- A/B testing framework

## API Endpoints

The wizard expects these API procedures (from `/packages/fresco-api/src/procedures/wizard.ts`):

- `checkSubdomain({ subdomain })` - Check subdomain availability
- `createSession({ email })` - Create signup session
- `updateSession({ sessionId, step, data })` - Update session progress
- `getSession({ sessionId })` - Retrieve session data
- `deployTenant({ sessionId })` - Initiate tenant deployment
- `getDeploymentStatus({ tenantId })` - Poll deployment status

## Future Enhancements

- [ ] Email verification integration
- [ ] OAuth provider support
- [ ] Custom domain configuration
- [ ] Team/organization support
- [ ] Payment integration for paid tiers
- [ ] Onboarding tour after signup
- [ ] Analytics event tracking
- [ ] Internationalization (i18n)
