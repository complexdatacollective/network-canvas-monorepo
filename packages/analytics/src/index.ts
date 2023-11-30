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

  public trackEvent(payload: EventPayload) {
    this.eventQueue.push(payload);
  }

  public trackError(error: ErrorPayload) {
    this.errorQueue.push(error);
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
