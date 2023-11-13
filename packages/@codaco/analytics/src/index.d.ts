export type EventPayload = {
  type:
    | "InterviewCompleted"
    | "InterviewStarted"
    | "ProtocolInstalled"
    | "AppSetup";
  metadata: string;
  timestamp?: string;
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
