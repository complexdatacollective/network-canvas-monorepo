import { AnalyticsClient } from '../dist/index.mjs';

describe('Class is able to be constructed', () => {
  it('should be able to create a new client', () => {
    const client = new AnalyticsClient();
    expect(client).toBeInstanceOf(AnalyticsClient);
  });
});

describe('Initial state', () => {
  let client;
  beforeEach(() => {
    client = new AnalyticsClient();
  });

  it('should initialize without an installation ID', () => {
    const client = new AnalyticsClient();
    expect(client.installationId).toBeUndefined();
  });

  it('should have the correct default platform URL', () => {
    expect(client.platformUrl).toEqual('https://analytics.networkcanvas.dev');
  })
})

describe('Supports configuration', () => {
  let client;
  beforeEach(() => {
    client = new AnalyticsClient();
  });

  it('should be able to set the platform URL', () => {
    const url = 'https://analytics.networkcanvas.com';
    const customClient = new AnalyticsClient({ platformUrl: url });
    expect(customClient.platformUrl).toEqual(url);
  });

  it('should be able to set the installation ID', () => {
    const id = '1234';
    client.setInstallationId(id);
    expect(client.installationId).toEqual(id);
  });

  it('Does not send events if no installation ID is set, and sends them when set', () => {
    expect(client.dispatchQueue.paused).toEqual(true);

    const id = '1234';
    client.setInstallationId(id);
    expect(client.dispatchQueue.paused).toEqual(false);
  });
});