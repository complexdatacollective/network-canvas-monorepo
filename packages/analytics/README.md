# @codaco/analytics

This npm package implements methods and types for sending analytics and errors from Fresco instances to a custom error and analytics microservice.

It exports two methods:

1. trackEvent - sends an event payload to the microservice.

```ts
type EventPayload = {
  type:
    | "InterviewCompleted"
    | "InterviewStarted"
    | "ProtocolInstalled"
    | "AppSetup";
  metadata?: string;
  timestamp?: string;
  isocode?: string;
  installationid: string;
};

trackEvent(event: EventPayload);

```

2. trackError - sends an error payload to the microservice.

```ts
type ErrorPayload = {
  code: number;
  message: string;
  details: string;
  stacktrace: string;
  installationid: string;
  timestamp?: string;
  path: string;
};

trackError(error: ErrorPayload);

```
