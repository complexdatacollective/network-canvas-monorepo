import { QueueObject, queue } from "async";

export type EventPayload = {
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

export type ErrorPayload = {
  code: number;
  message: string;
  details: string;
  stacktrace: string;
  installationid: string;
  timestamp?: string;
  path: string;
};

type AnalyticsEvent = {
  type: "event" | "error";
  label: string;
  payload: Record<string, unknown> | Error;
};

type AnalyticsClientConfiguration = {
  installationId: string;
  platformUrl?: string;
};

export class AnalyticsClient {
  private installationId: string;
  private eventQueue: QueueObject<EventPayload>;
  private errorQueue: QueueObject<ErrorPayload>;
  private enabled: boolean = true;
  private platformUrl?: string = "https://analytics.networkcanvas.dev";

  constructor(configuration: AnalyticsClientConfiguration) {
    if (!configuration.installationId) {
      throw new Error("Installation ID is required");
    }

    this.installationId = configuration.installationId;

    if (configuration.platformUrl) {
      this.platformUrl = configuration.platformUrl;
    }

    this.eventQueue = queue(this.processEvent, 1);
    this.errorQueue = queue(this.processError, 1);
  }

  private cleanEventPayload(payload: AnalyticsEvent): EventPayload {
    const cleanedPayload: EventPayload = {
      type: payload.label,
      metadata: JSON.stringify(payload.payload),
      installationid: this.installationId,
    };
    return cleanedPayload;
  }

  private cleanErrorPayload(payload: AnalyticsEvent): ErrorPayload {
    function extractPathFromStackTrace(
      stackTrace: string | undefined
    ): string | undefined {
      const pathRegex = /\bapp\/(.+):\d+:\d+\)/;
      const match = stackTrace?.match(pathRegex);

      return match ? match[1] : "";
    }
    const code = 404; // TODO: figure out how to get the error code
    const cleanedPayload: ErrorPayload = {
      code: code,
      message: JSON.stringify(payload.payload.message) || "",
      details: payload.label,
      stacktrace: JSON.stringify(payload.payload.stack) || "",
      installationid: this.installationId,
      path: extractPathFromStackTrace(payload.payload.stack as string) || "",
    };
    return cleanedPayload;
  }

  private async processEvent(event: EventPayload) {
    if (!this.enabled) {
      return;
    }

    await fetch(`${this.platformUrl}/api/event`, {
      method: "POST",
      body: JSON.stringify({
        ...event,
        installationId: this.installationId,
      }),
    });
  }

  private async processError(error: ErrorPayload) {
    if (!this.enabled) {
      return;
    }

    await fetch(`${this.platformUrl}/api/error`, {
      method: "POST",
      body: JSON.stringify({
        ...error,
        installationId: this.installationId,
      }),
    });
  }

  public trackEvent(payload: AnalyticsEvent) {
    const cleanedPayload = this.cleanEventPayload(payload);
    this.eventQueue.push(cleanedPayload);
  }

  public trackError(payload: AnalyticsEvent) {
    const cleanedPayload = this.cleanErrorPayload(payload);
    this.errorQueue.push(cleanedPayload);
  }

  public enable() {
    this.enabled = true;
  }

  public disable() {
    this.enabled = false;
  }

  get isEnabled() {
    return this.enabled;
  }
}
