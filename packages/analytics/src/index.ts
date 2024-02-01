import type { NextRequest } from "next/server";
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

// Raw events are the events that are sent to the route handler. They could be
// any of the event types, or an error, based on the type property.
const RawEventSchema = z.discriminatedUnion("type", [
  SharedEventAndErrorSchema.merge(EventSchema),
  SharedEventAndErrorSchema.merge(ErrorSchema),
]);
export type RawEvent = z.infer<typeof RawEventSchema>;

// This property is added by trackEvent
const TrackablePropertiesSchema = z
  .object({
    timestamp: z.string(),
  })
  .strict();

const TrackableEventSchema = z.intersection(
  RawEventSchema,
  TrackablePropertiesSchema
);
export type TrackableEvent = z.infer<typeof TrackableEventSchema>;

// These properties are added by the route handler
const DispatchablePropertiesSchema = z
  .object({
    installationId: z.string(),
    countryISOCode: z.string(),
  })
  .strict();

// Events that are ready to be sent to the platform
const DispatchableEventSchema = z.intersection(
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
        if (response.status === 404) {
          console.error(
            `Analytics platform could not be reached. Please specify a valid platform URL, or check that the platform is online.`
          );
        } else if (response.status === 500) {
          console.error(
            `Internal server error on analytics platform when forwarding event: ${response.statusText}.`
          );
        } else {
          console.error(
            `General error when forwarding event: ${response.statusText}`
          );
        }

        return new Response(
          JSON.stringify({ error: "Internal Server Error" }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }

      return new Response(
        JSON.stringify({ message: "Event forwarded successfully" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } catch (e) {
      const error = ensureError(e);
      console.error("Error in route handler:", error);

      // Return an appropriate error response
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      });
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

    try {
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
          console.error(
            `Analytics endpoint not found, did you forget to add the route?`
          );
          return;
        }

        if (response.status === 500) {
          console.error(
            `Internal server error when sending analytics event: ${response.statusText}. Check the route handler implementation.`
          );
          return;
        }

        console.error(
          `General error sending analytics event: ${response.statusText}`
        );
      }
    } catch (e) {
      const error = ensureError(e);
      console.error("Internal error with analytics:", error.message);
    }
  };
