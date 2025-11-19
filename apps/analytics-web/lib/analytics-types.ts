import z from "zod";

/**
 * Legacy analytics types for analytics-web app
 * These are kept here to maintain backward compatibility with the old analytics system
 * while the analytics-web app continues to run during the transition period
 */

// Event types supported by the old analytics system
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
	metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Raw events are the payload that is sent to trackEvent
 */
export const RawEventSchema = z.discriminatedUnion("type", [
	SharedEventAndErrorSchema.merge(EventSchema),
	SharedEventAndErrorSchema.merge(ErrorSchema),
]);
export type RawEvent = z.infer<typeof RawEventSchema>;

/**
 * Trackable events include a timestamp
 */
const TrackablePropertiesSchema = z.object({
	timestamp: z.string(),
});

export const TrackableEventSchema = z.intersection(RawEventSchema, TrackablePropertiesSchema);
export type TrackableEvent = z.infer<typeof TrackableEventSchema>;

/**
 * Analytics events include installation ID and country code
 */
const DispatchablePropertiesSchema = z.object({
	installationId: z.string(),
	countryISOCode: z.string(),
});

export const AnalyticsEventSchema = z.intersection(TrackableEventSchema, DispatchablePropertiesSchema);
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
