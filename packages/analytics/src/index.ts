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
  timestamp: Date;
};

type AnalyticsClientConfiguration = {
  platformUrl?: string;
};

export class AnalyticsClient {
  private platformUrl?: string = "https://analytics.networkcanvas.dev";
  private installationId: string | null = null;

  private dispatchQueue: QueueObject<AnalyticsEventOrError>;

  private enabled: boolean = true;

  constructor(configuration: AnalyticsClientConfiguration) {
    if (configuration.platformUrl) {
      this.platformUrl = configuration.platformUrl;
    }

    this.dispatchQueue = queue(this.processEvent, 1);
    this.dispatchQueue.pause(); // Start the queue paused so we can set the installation ID
  }

  public createRouteHandler =
    (maxMindClient: WebServiceClient) =>
    async (req: NextRequest): Promise<Response> => {
      const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(
        ","
      )[0];

      if (ip === "::1") {
        // This is a localhost request, so we can't geolocate it.
        return new Response(null, { status: 200 });
      }

      if (!ip) {
        console.error("No IP address provided for geolocation");
        return new Response(null, { status: 500 });
      }

      try {
        const response = await maxMindClient.country(ip);

        return new Response(response?.country?.isoCode, {
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error getting country code", error);
        return new Response(null, { status: 500 });
      }
    };

  private processEvent = async (event: AnalyticsEventOrError) => {
    // Todo: we need to think about client vs server geolocation. If we want
    // client, does this get us that? If we want server, we can get it once,
    // and simply store it.
    // Todo: use fetchWithZod?
    try {
      const response = await fetch("api/analytics/geolocate");
      if (!response.ok) {
        console.error("Geolocation request failed");
      }

      const countryCode: string | null = await response.text();

      const eventWithRequiredProperties: DispatchableAnalyticsEvent = {
        ...event,
        installationId: this.installationId ?? "",
        timestamp: new Date(),
        geolocation: {
          countryCode: countryCode ?? "",
        },
      };

      // We could validate against a zod schema here.

      // Send event to microservice.

      const result = await fetch(`${this.platformUrl}/api/event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventWithRequiredProperties),
      });

      if (!result.ok) {
        console.info(
          `🚫 Event "${eventWithRequiredProperties.type}" failed to send to analytics microservice.`
        );
        return;
      }

      console.info(
        `🚀 Event "${eventWithRequiredProperties.type}" successfully sent to analytics microservice`
      );
    } catch (error) {
      console.error("Error sending event to analytics microservice", error);
      return;
    }
  };

  public trackEvent(payload: AnalyticsEventOrError) {
    console.info(`🕠 Event ${payload.type} queued for dispatch...`);
    this.dispatchQueue.push(payload);
  }

  public setInstallationId(installationId: string) {
    if (this.enabled) {
      try {
        this.installationId = installationId;
        this.dispatchQueue.resume();
        console.info("📈 Analytics queue resumed");
      } catch (error) {
        console.error("Error setting installation ID", error);
      }
    }
  }

  public disable() {
    console.info("📈 Analytics disabled");
    this.enabled = false;
    this.dispatchQueue.pause();
  }

  get isEnabled() {
    return this.enabled;
  }
}
