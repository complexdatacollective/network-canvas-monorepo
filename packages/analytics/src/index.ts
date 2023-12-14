import type { NextRequest } from "next/server";
import { WebServiceClient } from "@maxmind/geoip2-node";
import { ensureError } from "./utils";

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

export type AnalyticsEventOrErrorWithTimestamp = AnalyticsEventOrError & {
  timestamp: Date;
};

export type DispatchableAnalyticsEvent = AnalyticsEventOrErrorWithTimestamp & {
  installationId: string;
  geolocation?: GeoLocation;
};

type RouteHandlerConfiguration = {
  maxMindAccountId: string;
  maxMindLicenseKey: string;
  platformUrl?: string;
  getInstallationId: () => Promise<string>;
  WebServiceClient: typeof WebServiceClient;
};

export const createRouteHandler = ({
  maxMindAccountId,
  maxMindLicenseKey,
  platformUrl = "https://analytics.networkcanvas.com",
  getInstallationId,
  WebServiceClient,
}: RouteHandlerConfiguration) => {
  return async (request: NextRequest) => {
    const maxMindClient = new WebServiceClient(
      maxMindAccountId,
      maxMindLicenseKey,
      {
        host: "geolite.info",
      }
    );

    const installationId = await getInstallationId();

    const event = (await request.json()) as AnalyticsEventOrErrorWithTimestamp;

    const ip = await fetch("https://api64.ipify.org").then((res) => res.text());

    const { country } = await maxMindClient.country(ip);
    const countryCode = country?.isoCode ?? "Unknown";

    const dispatchableEvent: DispatchableAnalyticsEvent = {
      ...event,
      installationId,
      geolocation: {
        countryCode,
      },
    };

    console.log(dispatchableEvent);

    // Forward to microservice
    void fetch(`${platformUrl}/api/event`, {
      keepalive: true,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dispatchableEvent),
    });

    return Response.json({
      message: "This is the API route",
    });
  };
};

export const makeEventTracker =
  ({ endpoint }: { endpoint: string }) =>
  (event: AnalyticsEventOrError) => {
    const eventWithTimeStamp = {
      ...event,
      timestamp: new Date(),
    };

    fetch(endpoint, {
      method: "POST",
      keepalive: true,
      body: JSON.stringify(eventWithTimeStamp),
      headers: {
        "Content-Type": "application/json",
      },
    }).catch((e) => {
      const error = ensureError(e);

      // eslint-disable-next-line no-console
      console.error("Error sending analytics event:", error.message);
    });
  };
