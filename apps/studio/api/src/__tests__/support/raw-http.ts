import { request } from 'node:http';

export type RawResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: Buffer;
};

/**
 * One request with its path sent exactly as written. `fetch` and `new URL`
 * both normalise a path before it leaves — resolving `./` and `../`, and
 * reading a leading `//` as a host — so a case about how the server matches
 * an unusual path has to bypass them.
 */
export function rawRequest(
  origin: string,
  path: string,
  options: {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
  } = {},
): Promise<RawResponse> {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: hostname,
        port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('error', reject);
        incoming.on('end', () =>
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}
