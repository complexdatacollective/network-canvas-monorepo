// This file is a single source of truth for shared constants
// between the analytics app and analytics package.

import z from "zod";

export const eventTypes = [
  "AppSetup",
  "ProtocolInstalled",
  "InterviewStarted",
  "InterviewCompleted",
  "InterviewCompleted",
  "DataExported",
  "Error",
] as const;

export type EventType = (typeof eventTypes)[number];

export const EventsSchema = z.object({
  type: z.enum(eventTypes),
  installationId: z.string(),
  timestamp: z.string(),
  isocode: z.string().optional(),
  message: z.string().optional(),
  name: z.string().optional(),
  stack: z.string().optional(),
  metadata: z
    .object({
      details: z.string().optional(),
      path: z.string().optional(),
    })
    .optional(),
});

export type Event = z.infer<typeof EventsSchema>;
