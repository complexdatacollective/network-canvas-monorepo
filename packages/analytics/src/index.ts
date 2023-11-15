export type EventPayload = {
  type:
    | "InterviewCompleted"
    | "InterviewStarted"
    | "ProtocolInstalled"
    | "AppSetup";
  metadata?: string;
  timestamp?: string;
  isocode?: string;
  installationid: string;
};

export type ErrorPayload = {
  code: number;
  message: string;
  details: string;
  stacktrace: string;
  installationid: string;
  timestamp?: string;
  path: string;
};

export async function trackEvent(event: EventPayload) {
  const endpoint = "localhost:3000/api/event";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: event }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
  } catch (error) {
    throw new Error("Failed to make the request");
  }
}

export async function trackError(error: ErrorPayload) {
  const endpoint = "localhost:3000/api/error";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ errorPayload: error }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
  } catch (error) {
    throw new Error("Failed to make the request");
  }
}
