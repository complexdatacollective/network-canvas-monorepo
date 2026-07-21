type DocSearchConfigCandidate = {
  appId?: string;
  indexName?: string;
  apiKey?: string;
};

type DocSearchConfig = {
  appId: string;
  indexName: string;
  apiKey: string;
};

export function getDocSearchConfig({
  appId: candidateAppId,
  indexName: candidateIndexName,
  apiKey: candidateApiKey,
}: DocSearchConfigCandidate): DocSearchConfig | null {
  const appId = candidateAppId?.trim();
  const indexName = candidateIndexName?.trim();
  const apiKey = candidateApiKey?.trim();

  if (!appId || !indexName || !apiKey) return null;

  return { appId, indexName, apiKey };
}
