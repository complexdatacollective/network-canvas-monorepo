import insertEvent from "~/db/insertEvent";
import { Event, POST } from "./route";

import { createMocks as _createMocks } from "node-mocks-http";
import type { RequestOptions, ResponseOptions } from "node-mocks-http";
import { NextRequest, NextResponse } from "next/server";

const createMocks = _createMocks as (
  reqOptions?: RequestOptions,
  resOptions?: ResponseOptions
  // @ts-ignore: Fixing this: https://github.com/howardabrams/node-mocks-http/issues/245
) => Mocks<NextRequest, NextResponse>;

jest.mock("~/db/insertEvent", () => jest.fn());

describe("/api/event", () => {
  test("should insert event to the database", async () => {
    const eventData = {
      type: "AppSetup",
      metadata: {
        details: "testing details",
        path: "testing path",
      },
      installationId: "21321546453213123",
      timestamp: new Date(),
      isocode: "US",
    };

    const mockInsertEvent = async (eventData: Event) => {
      return { data: eventData, error: null };
    };

    const { req } = createMocks({
      method: "POST",
      body: eventData,
    });

    const response = await POST(req);
    expect(mockInsertEvent).toHaveBeenCalledWith(eventData);
    expect(response.status).toBe(200);
    expect(response.headers).toEqual({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    expect(await response.json()).toEqual(eventData);
  }),
    test("should return 401 if event is invalid", async () => {
      const eventData = {
        type: "InvalidEvent",
        metadata: {
          details: "testing details",
          path: "testing path",
        },
        timestamp: new Date(),
        isocode: "US",
      };

      const { req } = createMocks({
        method: "POST",
        body: eventData,
      });

      const response = await POST(req as any);
      expect(insertEvent).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
      expect(response.headers).toEqual({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      expect(await response.json()).toEqual({ error: "Invalid event" });
    }),
    test("should return 500 if there is an error inserting the event to the database", async () => {
      const eventData = {
        type: "AppSetup",
        metadata: {
          details: "testing details",
          path: "testing path",
        },
        installationId: "21321546453213123",
        timestamp: new Date(),
        isocode: "US",
      };

      const mockInsertEvent = async (eventData: Event) => {
        return { data: null, error: "Error inserting events" };
      };

      const { req } = createMocks({
        method: "POST",
        body: eventData,
      });

      const response = await POST(req as any);
      expect(mockInsertEvent).toHaveBeenCalledWith(eventData);
      expect(response.status).toBe(500);
      expect(response.headers).toEqual({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      expect(await response.json()).toEqual({
        error: "Error inserting events",
      });
    });
});
