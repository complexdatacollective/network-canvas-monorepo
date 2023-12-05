import { WebServiceClient } from "@maxmind/geoip2-node";
import { QueueObject, queue } from "async";
import type { NextRequest } from "next/server";

type GeoLocation = {
  countryCode: string;
};

export type AnalyticsEventBase = {
  type:
    | "InterviewCompleted"
    | "InterviewStarted"
    | "ProtocolInstalled"
    | "AppSetup"
    | "Error";
  timestamp?: string;
};

export type AnalyticsEvent = AnalyticsEventBase & {
  type:
    | "InterviewCompleted"
    | "InterviewStarted"
    | "ProtocolInstalled"
    | "AppSetup";
  metadata?: Record<string, unknown>;
};

export type AnalyticsError = AnalyticsEventBase & {
  type: "Error";
  error: {
    code: number;
    message: string;
    details: string;
    stacktrace: string;
    path: string;
  };
};

export type AnalyticsEventOrError = AnalyticsEvent | AnalyticsError;

export type DispatchableAnalyticsEvent = AnalyticsEventOrError & {
  installationId: string;
  geolocation?: GeoLocation;
};

type AnalyticsClientConfiguration = {
  maxmindAccountId: string;
  maxmindLicenseKey: string;
  platformUrl?: string;
};

export class AnalyticsClient {
  private platformUrl?: string = "https://analytics.networkcanvas.dev";
  private installationId: string | null = null;
  private maxmindAccountId: string;
  private maxmindLicenseKey: string;
  private maxMindClient: WebServiceClient;

  private dispatchQueue: QueueObject<AnalyticsEventOrError>;

  private enabled: boolean = false;

  constructor(configuration: AnalyticsClientConfiguration) {
    if (!configuration.maxmindAccountId || !configuration.maxmindLicenseKey) {
      throw new Error("Maxmind API key is required");
    }

    this.maxmindAccountId = configuration.maxmindAccountId;
    this.maxmindLicenseKey = configuration.maxmindLicenseKey;

    this.maxMindClient = new WebServiceClient(
      this.maxmindAccountId,
      this.maxmindLicenseKey,
      {
        host: "geolite.info",
      }
    );

    if (configuration.platformUrl) {
      this.platformUrl = configuration.platformUrl;
    }

    this.dispatchQueue = queue(this.processEvent, 1);
    this.dispatchQueue.pause(); // Start the queue paused so we can set the installation ID
  }

  public async geoLocationRouteHandler(req: NextRequest) {
    const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(
      ","
    )[0];

    if (!ip) {
      console.error("No IP address provided for geolocation");
      return null;
    }

    try {
      const response = await this.maxMindClient.country(ip);

      return response?.country?.isoCode ?? null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error getting country code");
      return null;
    }
  }

  private async processEvent(event: AnalyticsEventOrError) {
    // Todo: we need to think about client vs server geolocation. If we want
    // client, does this get us that? If we want server, we can get it once,
    // and simply store it.
    // Todo: use fetchWithZod?
    const response = await fetch("api/analytics/geolocate");
    const countryCode: string | null = await response.json();

    const eventWithRequiredProperties: DispatchableAnalyticsEvent = {
      ...event,
      installationId: this.installationId ?? "",
      geolocation: {
        countryCode: countryCode ?? "",
      },
    };

    // We could validate against a zod schema here.

    // Send event to microservice.
    try {
      await fetch(`${this.platformUrl}/api/event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventWithRequiredProperties),
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error sending event to analytics microservice");
    }
  }

  public trackEvent(payload: AnalyticsEvent | AnalyticsError) {
    this.dispatchQueue.push(payload);
  }

  public setInstallationId(installationId: string) {
    this.installationId = installationId;
  }

  public enable() {
    if (!this.installationId) {
      throw new Error("Installation ID is required to enable analytics.");
    }

    this.enabled = true;
    this.dispatchQueue.resume();
  }

  public disable() {
    this.enabled = false;
    this.dispatchQueue.pause();
  }

  get isEnabled() {
    return this.enabled;
  }
}
