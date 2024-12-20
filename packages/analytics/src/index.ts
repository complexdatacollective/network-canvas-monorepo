import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { ensureError } from "./utils";

// Todo: it would be great to work out a way to support arbitrary types here.
export const eventTypes = [
	"AppSetup",
	"ProtocolInstalled",
	"InterviewStarted",
	"InterviewCompleted",
	"DataExported",
] as const;

const EventSchema = z.object({
	type: z.enum(eventTypes),
});

const ErrorSchema = z.object({
	type: z.literal("Error"),
	message: z.string(),
	name: z.string(),
	stack: z.string().optional(),
	cause: z.string().optional(),
});

const SharedEventAndErrorSchema = z.object({
	metadata: z.record(z.unknown()).optional(),
});

/**
 * Raw events are the payload that is sent to trackEvent, which can be either
 * general events or errors. We discriminate on the `type` property to determine
 * which schema to use, and then merge the shared properties.
 */
export const RawEventSchema = z.discriminatedUnion("type", [
	SharedEventAndErrorSchema.merge(EventSchema),
	SharedEventAndErrorSchema.merge(ErrorSchema),
]);
export type RawEvent = z.infer<typeof RawEventSchema>;

/**
 * Trackable events are the events that are sent to the route handler by
 * `trackEvent`. The function adds the timestamp to ensure it is not inaccurate
 * due to network latency or processing time.
 */
const TrackablePropertiesSchema = z.object({
	timestamp: z.string(),
});

export const TrackableEventSchema = z.intersection(RawEventSchema, TrackablePropertiesSchema);
export type TrackableEvent = z.infer<typeof TrackableEventSchema>;

/**
 * Dispatchable events are the events that are sent to the platform. The route
 * handler injects the installationId and countryISOCode properties.
 */
const DispatchablePropertiesSchema = z.object({
	installationId: z.string(),
	countryISOCode: z.string(),
});

/**
 * The final schema for an analytics event. This is the schema that is used to
 * validate the event before it is inserted into the database. It is the
 * intersection of the trackable event and the dispatchable properties.
 */
export const AnalyticsEventSchema = z.intersection(TrackableEventSchema, DispatchablePropertiesSchema);
export type analyticsEvent = z.infer<typeof AnalyticsEventSchema>;

type GeoData = {
	status: "success" | "fail";
	countryCode: string;
	message: string;
};

export const createRouteHandler = ({
	platformUrl = "https://analytics.networkcanvas.com",
	installationId,
	disableAnalytics,
}: {
	platformUrl?: string;
	installationId: string;
	disableAnalytics?: boolean;
}) => {
	return async (request: NextRequest) => {
		try {
			const incomingEvent = (await request.json()) as unknown;

			// Check if analytics is disabled
			if (disableAnalytics) {
				console.info("🛑 Analytics disabled. Payload not sent.");
				try {
					console.info("Payload:", "\n", JSON.stringify(incomingEvent, null, 2));
				} catch (e) {
					console.error("Error stringifying payload:", e);
				}

				return NextResponse.json({ message: "Analytics disabled" }, { status: 200 });
			}

			// Validate the event
			const trackableEvent = TrackableEventSchema.safeParse(incomingEvent);

			if (!trackableEvent.success) {
				console.error("Invalid event:", trackableEvent.error);
				return NextResponse.json({ error: "Invalid event" }, { status: 400 });
			}

			// We don't want failures in third party services to prevent us from
			// tracking analytics events, so we'll catch any errors and log them
			// and continue with an 'Unknown' country code.
			let countryISOCode = "Unknown";
			try {
				const ip = await fetch("https://api64.ipify.org").then((res) => res.text());

				if (!ip) {
					throw new Error("Could not fetch IP address");
				}

				const geoData = (await fetch(`http://ip-api.com/json/${ip}`).then((res) => res.json())) as GeoData;

				if (geoData.status === "success") {
					countryISOCode = geoData.countryCode;
				} else {
					throw new Error(geoData.message);
				}
			} catch (e) {
				console.error("Geolocation failed:", e);
			}

			const analyticsEvent: analyticsEvent = {
				...trackableEvent.data,
				installationId,
				countryISOCode,
			};

			// Forward to backend
			const response = await fetch(`${platformUrl}/api/event`, {
				keepalive: true,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(analyticsEvent),
			});

			if (!response.ok) {
				let error = `Analytics platform returned an unexpected error: ${response.statusText}`;

				if (response.status === 400) {
					error = "Analytics platform rejected the event as invalid. Please check the event schema";
				}

				if (response.status === 404) {
					error =
						"Analytics platform could not be reached. Please specify a valid platform URL, or check that the platform is online.";
				}

				if (response.status === 500) {
					error = "Analytics platform returned an internal server error. Please check the platform logs.";
				}

				console.info(`⚠️ Analytics platform rejected event: ${error}`);
				return Response.json(
					{
						error,
					},
					{ status: 500 },
				);
			}
			console.info("🚀 Analytics event sent to platform!");
			return Response.json({ message: "Event forwarded successfully" });
		} catch (e) {
			const error = ensureError(e);
			console.info("🚫 Internal error with sending analytics event.");

			return Response.json({ error: `Error in analytics route handler: ${error.message}` }, { status: 500 });
		}
	};
};

export const makeEventTracker =
	(options?: { endpoint?: string }) =>
	async (
		event: RawEvent,
	): Promise<{
		error: string | null;
		success: boolean;
	}> => {
		// We use a relative path by default, which should automatically use the
		// same origin as the page that is sending the event.
		const endpoint = options?.endpoint ?? "/api/analytics";

		const eventWithTimeStamp: TrackableEvent = {
			...event,
			timestamp: new Date().toJSON(),
		};

		try {
			const response = await fetch(endpoint, {
				method: "POST",
				keepalive: true,
				body: JSON.stringify(eventWithTimeStamp),
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				if (response.status === 404) {
					return {
						error: "Analytics endpoint not found, did you forget to add the route?",
						success: false,
					};
				}

				// createRouteHandler will return a 400 if the event failed schema validation.
				if (response.status === 400) {
					return {
						error: `Invalid event sent to analytics endpoint: ${response.statusText}`,
						success: false,
					};
				}

				// createRouteHandler will return a 500 for all error states
				return {
					error: `Internal server error when sending analytics event: ${response.statusText}. Check the route handler implementation.`,
					success: false,
				};
			}

			return { error: null, success: true };
		} catch (e) {
			const error = ensureError(e);
			return {
				error: `Internal error when sending analytics event: ${error.message}`,
				success: false,
			};
		}
	};
