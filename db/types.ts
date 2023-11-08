export type Error = {
  code: number;
  message: string;
  details: string;
  stacktrace: string;
  timestamp: string;
  installationid: string;
  path: string;
};

export type Event = {
  event: string;
  timestamp: string;
  installationid: string;
};
