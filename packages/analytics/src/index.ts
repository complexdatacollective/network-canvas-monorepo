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
  private platformUrl: string = "https://analytics.networkcanvas.dev";
  private installationId: string | undefined = undefined;

  private dispatchQueue: QueueObject<AnalyticsEventOrError>;

  constructor(configuration: AnalyticsClientConfiguration | null) {
    if (configuration?.platformUrl) {
      this.platformUrl = configuration.platformUrl;
    }

    this.dispatchQueue = queue(this.processEvent, 1);
    this.dispatchQueue.pause(); // Start the queue paused so we can set the installation ID
  }

  public createRouteHandler =
    (maxMindClient: WebServiceClient) =>
    async (req: NextRequest): Promise<Response> => {
      let ip;

      if (
        req.headers.get("x-forwarded-for") &&
        !(req.headers.get("x-forwarded-for")?.split(",")[0] == "::1")
      ) {
        ip = req.headers.get("x-forwarded-for")?.split(",")[0];
      } else {
        // attempt geolocation via third party service
        ip = await fetch("https://api64.ipify.org").then((res) => res.text());
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

  private geoLocate = async () => {
    try {
      const response = await fetch(`api/analytics/geolocate`);
      if (!response.ok) {
        throw new Error("Geolocation request failed");
      }

      const countryCode: string | null = await response.text();
      return countryCode;
    } catch (error) {
      throw new Error("Error fetching country code");
    }
  };

  private sendToMicroservice = async (event: DispatchableAnalyticsEvent) => {
    try {
      const result = await fetch(`${this.platformUrl}/api/event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      if (!result.ok) {
        throw new Error("Error sending event to microservice");
      }

      console.info(
        `🚀 Event "${event.type}" successfully sent to analytics microservice!`
      );
    } catch (e) {
      throw new Error("Error sending event to microservice");
    }
  };

  private processEvent = async (event: AnalyticsEventOrError) => {
    // Todo: we need to think about client vs server geolocation. If we want
    // client, does this get us that? If we want server, we can get it once,
    // and simply store it.
    try {
      const countryCode = await this.geoLocate();

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
      await this.sendToMicroservice(eventWithRequiredProperties);
    } catch (error) {
      console.error("❗️ Error sending event to analytics microservice", error);
      return;
    }
  };

  public trackEvent(payload: AnalyticsEventOrError) {
    this.dispatchQueue.push(payload);
    console.info(
      `🕠 Event ${
        payload.type
      } queued for dispatch. Current queue size is ${this.dispatchQueue.length()}.`
    );
  }

  public setInstallationId(installationId: string) {
    this.installationId = installationId;
    console.info(`🆔 Installation ID set to ${installationId}`);
    this.dispatchQueue.resume();
  }
}
