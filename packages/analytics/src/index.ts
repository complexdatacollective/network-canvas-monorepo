import { WebServiceClient } from "@maxmind/geoip2-node";
import { QueueObject, queue } from "async";
import type { NextRequest } from "next/server";

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
  maxmindAccountId: string;
  maxmindLicenseKey: string;
  platformUrl?: string;
};

export class AnalyticsClient {
  private installationId: string;
  private maxmindAccountId: string;
  private maxmindLicenseKey: string;
  private eventQueue: QueueObject<EventPayload>;
  private errorQueue: QueueObject<ErrorPayload>;
  private enabled: boolean = true;
  private platformUrl?: string = "https://analytics.networkcanvas.dev";

  constructor(configuration: AnalyticsClientConfiguration) {
    if (!configuration.installationId) {
      throw new Error("Installation ID is required");
    }

    if (!configuration.maxmindAccountId || !configuration.maxmindLicenseKey) {
      throw new Error("Maxmind API key is required");
    }

    this.installationId = configuration.installationId;
    this.maxmindAccountId = configuration.maxmindAccountId;
    this.maxmindLicenseKey = configuration.maxmindLicenseKey;

    if (configuration.platformUrl) {
      this.platformUrl = configuration.platformUrl;
    }

    this.eventQueue = queue(this.processEvent, 1);
    this.errorQueue = queue(this.processError, 1);
  }

  public async routeHandler(req: NextRequest) {
    const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(
      ","
    )[0];
    const client = new WebServiceClient(
      this.maxmindAccountId,
      this.maxmindLicenseKey,
      {
        host: "geolite.info",
      }
    );

    try {
      if (!ip) {
        console.error("Could not get IP address");
        return null;
      }
      const response = await client.country(ip);

      if (!response || !response.country || !response.country.isoCode) {
        // eslint-disable-next-line no-console
        console.error("Could not get country code");
        return null;
      }

      return response.country.isoCode;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error getting country code");
      return null;
    }
  }

  private cleanEventPayload(payload: AnalyticsEvent): EventPayload {
    // temp workaround for Type 'string' is not assignable to type '"InterviewCompleted" | "InterviewStarted" | "ProtocolInstalled" | "AppSetup"'.
    if (
      payload.label !== "InterviewCompleted" &&
      payload.label !== "InterviewStarted" &&
      payload.label !== "ProtocolInstalled" &&
      payload.label !== "AppSetup"
    ) {
      return {
        type: "InterviewCompleted",
        metadata: JSON.stringify(payload.payload),
        installationid: this.installationId,
      };
    }
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

    const geolocation = await fetch("api/analytics");

    await fetch(`${this.platformUrl}/api/event`, {
      method: "POST",
      body: JSON.stringify({
        ...event,
        isocode: geolocation,
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
