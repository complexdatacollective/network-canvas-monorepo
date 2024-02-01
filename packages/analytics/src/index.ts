import { NextResponse, type NextRequest } from "next/server";
import { WebServiceClient } from "@maxmind/geoip2-node";
import { ensureError, getBaseUrl } from "./utils";
import z from "zod";

// Todo: it would be great to work out a way to support arbitrary types here.
export const eventTypes = [
  "AppSetup",
  "ProtocolInstalled",
  "InterviewStarted",
  "InterviewCompleted",
  "DataExported",
] as const;

// Properties that everything has in common.
const SharedEventAndErrorSchema = z
  .object({
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const EventSchema = z
  .object({
    type: z.enum(eventTypes),
  })
  .strict();

const ErrorSchema = z
  .object({
    type: z.literal("Error"),
    error: z
      .object({
        message: z.string(),
        name: z.string(),
        stack: z.string().optional(),
      })
      .strict(),
  })
  .strict();

// Raw events are the events that are sent trackEvent.
export const RawEventSchema = z.discriminatedUnion("type", [
  SharedEventAndErrorSchema.merge(EventSchema),
  SharedEventAndErrorSchema.merge(ErrorSchema),
]);
export type RawEvent = z.infer<typeof RawEventSchema>;

// Trackable events are the events that are sent to the route handler.
const TrackablePropertiesSchema = z
  .object({
    timestamp: z.string(),
  })
  .strict();

export const TrackableEventSchema = z.intersection(
  RawEventSchema,
  TrackablePropertiesSchema
);
export type TrackableEvent = z.infer<typeof TrackableEventSchema>;

// Dispatchable events are the events that are sent to the platform.
const DispatchablePropertiesSchema = z
  .object({
    installationId: z.string(),
    countryISOCode: z.string(),
  })
  .strict();

export const DispatchableEventSchema = z.intersection(
  TrackableEventSchema,
  DispatchablePropertiesSchema
);
export type DispatchableEvent = z.infer<typeof DispatchableEventSchema>;

type RouteHandlerConfiguration = {
  platformUrl?: string;
  installationId: string;
  maxMindClient: WebServiceClient;
};

export const createRouteHandler = ({
  platformUrl = "https://analytics.networkcanvas.com",
  installationId,
  maxMindClient,
}: RouteHandlerConfiguration) => {
  return async (request: NextRequest) => {
    try {
      const incomingEvent = (await request.json()) as unknown;

      // Validate the event
      const trackableEvent = TrackableEventSchema.safeParse(incomingEvent);

      if (!trackableEvent.success) {
        console.error("Invalid event:", trackableEvent.error);
        return new Response(JSON.stringify({ error: "Invalid event" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      // We don't want failures in third party services to prevent us from
      // tracking analytics events.
      let countryISOCode = "Unknown";
      try {
        const ip = await fetch("https://api64.ipify.org").then((res) =>
          res.text()
        );
        const { country } = await maxMindClient.country(ip);
        countryISOCode = country?.isoCode ?? "Unknown";
      } catch (e) {
        console.error("Geolocation failed:", e);
      }

      const dispatchableEvent: DispatchableEvent = {
        ...trackableEvent.data,
        installationId,
        countryISOCode,
      };

      // Forward to microservice
      const response = await fetch(`${platformUrl}/api/event`, {
        keepalive: true,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dispatchableEvent),
      });

      if (!response.ok) {
        let error = `Analytics platform returned an unexpected error: ${response.statusText}`;

        if (response.status === 400) {
          error = `Analytics platform rejected the event as invalid. Please check the event schema`;
        }

        if (response.status === 404) {
          error = `Analytics platform could not be reached. Please specify a valid platform URL, or check that the platform is online.`;
        }

        if (response.status === 500) {
          error = `Analytics platform returned an internal server error. Please check the platform logs.`;
        }

        return NextResponse.json(
          {
            error,
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ message: "Event forwarded successfully" });
    } catch (e) {
      const error = ensureError(e);
      console.error("Error in route handler:", error.message);

      return NextResponse.json(
        { error: `Error in analytics route handler: ${error.message}` },
        { status: 500 }
      );
    }
  };
};

export const makeEventTracker =
  (endpoint: string = "/api/analytics") =>
  async (event: RawEvent) => {
    // If analytics is disabled don't send analytics events.
    if (process.env.DISABLE_ANALYTICS === "true") {
      return;
    }

    const endpointWithHost = getBaseUrl() + endpoint;

    const eventWithTimeStamp: TrackableEvent = {
      ...event,
      timestamp: new Date().toJSON(),
    };

    const response = await fetch(endpointWithHost, {
      method: "POST",
      keepalive: true,
      body: JSON.stringify(eventWithTimeStamp),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Analytics endpoint not found, did you forget to add the route?`
        );
      }

      // createRouteHandler will return a 400 if the event failed schema validation.
      if (response.status === 400) {
        throw new Error(
          `Invalid event sent to analytics endpoint: ${response.statusText}`
        );
      }

      // createRouteHandler will return a 500 for all error states
      throw new Error(
        `Internal server error when sending analytics event: ${response.statusText}. Check the route handler implementation.`
      );
    }
  };
