import { testApiHandler } from "next-test-api-route-handler";
import insertEvent from "~/db/insertEvent";
import * as appHandler from "./route";

jest.mock("~/db/insertEvent", () => async (eventData: Event) => {
  return { data: eventData, error: null };
});

describe("/api/event", () => {
  it("should insert event to the database", async () => {
    const eventData = {
      type: "AppSetup",
      metadata: {
        details: "testing details",
        path: "testing path",
      },
      installationId: "21321546453213123",
      timestamp: new Date().toString(),
    };

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: "POST",
          body: JSON.stringify(eventData),
        });
        expect(insertEvent).toHaveBeenCalledWith({
          ...eventData,
          timestamp: new Date(eventData.timestamp),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ event: eventData });
      },
    });
  });

  it("should return 400 if event is invalid", async () => {
    const eventData = {
      type: "InvalidEvent",
      metadata: {
        details: "testing details",
        path: "testing path",
      },
      timestamp: new Date().toString(),
    };

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: "POST",
          body: JSON.stringify(eventData),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Invalid event" });
      },
    });
  });

  it("should return 500 if there is an error inserting the event to the database", async () => {
    const eventData = {
      type: "AppSetup",
      metadata: {
        details: "testing details",
        path: "testing path",
      },
      installationId: "21321546453213123",
      timestamp: new Date().toString(),
    };

    (insertEvent as jest.Mock).mockImplementation(async (eventData) => {
      return { data: null, error: "Error inserting events" };
    });

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: "POST",
          body: JSON.stringify(eventData),
        });
        expect(insertEvent).toHaveBeenCalledWith({
          ...eventData,
          timestamp: new Date(eventData.timestamp),
        });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
          error: "Error inserting events",
        });
      },
    });
  });
});
