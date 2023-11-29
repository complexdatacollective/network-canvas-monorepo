import { createContext, useContext, useEffect, useState } from "react";

export type EventPayload = {
  type:
    | "InterviewCompleted"
    | "InterviewStarted"
    | "ProtocolInstalled"
    | "AppSetup";
  metadata: string;
  timestamp?: string;
};

export type ErrorPayload = {
  code: number;
  message: string;
  details: string;
  stacktrace: string;
  timestamp?: string;
  path: string;
};

type AnalyticsContextType = {
  enabled: boolean;
  endpoint: string;
  eventQueue: EventPayload[];
  errorQueue: ErrorPayload[];
  id?: string;
  sendEvent: (event: EventPayload) => void;
  sendError: (error: ErrorPayload) => void;
};

const AnalyticsContext = createContext<AnalyticsContextType>({
  enabled: false,
  endpoint: "",
  eventQueue: [],
  errorQueue: [],
  sendEvent: () => {},
  sendError: () => {},
});
export const AnalyticsProvider = ({
  children,
  id,
  enabled,
  endpoint,
}: {
  id?: string; // todo: pass id to endpoint with the rest of the payload
  enabled: boolean;
  endpoint: string; // todo: make optional and provide default
  children: React.ReactNode;
}) => {
  const [eventQueue, setEventQueue] = useState<EventPayload[]>([]);
  const [errorQueue, setErrorQueue] = useState<ErrorPayload[]>([]);

  // send events and errors to queue
  const sendEvent = (event: EventPayload) => {
    setEventQueue((prevQueue) => [...prevQueue, event]);
  };
  const sendError = (error: ErrorPayload) => {
    setErrorQueue((prevQueue) => [...prevQueue, error]);
  };

  useEffect(() => {
    const sendEventsInBackground = async () => {
      while (eventQueue.length > 0) {
        const event = eventQueue[0];
        // Send event to the analytics service
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(event),
          });

          if (!response.ok) {
            throw new Error(
              `Failed to send event to analytics service: ${response.status} ${response.statusText}`
            );
          }

          // Remove the sent event from the queue
          setEventQueue((prevQueue) => prevQueue.slice(1));
        } catch (error) {
          console.error(error);
        }
      }
    };

    if (enabled) {
      sendEventsInBackground();
    }
  }, [eventQueue, enabled, endpoint]);

  useEffect(() => {
    const sendErrorsInBackground = async () => {
      while (errorQueue.length > 0) {
        const error = errorQueue[0];
        // Send error to the analytics service
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(error),
          });

          if (!response.ok) {
            throw new Error(
              `Failed to send event to analytics service: ${response.status} ${response.statusText}`
            );
          }

          // Remove the sent error from the queue
          setErrorQueue((prevQueue) => prevQueue.slice(1));
        } catch (error) {
          console.error(error);
        }
      }
    };

    if (enabled) {
      sendErrorsInBackground();
    }
  }, [errorQueue, enabled, endpoint]);

  const value: AnalyticsContextType = {
    enabled,
    endpoint,
    id,
    eventQueue,
    errorQueue,
    sendEvent,
    sendError,
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalytics = () => {
  const analytics = useContext(AnalyticsContext);

  if (!analytics) {
    throw new Error("useAnalytics must be used within an AnalyticsProvider");
  }

  return analytics;
};
