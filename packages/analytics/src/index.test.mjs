import { jest } from '@jest/globals';
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

});

describe('Sending events', () => {
  let client;
  beforeEach(() => {
    client = new AnalyticsClient();

    jest.spyOn(client, 'processEvent').mockImplementation(async () => {
      console.log('processEvent');
      return;
    });

    jest.spyOn(client, 'geoLocate').mockImplementation(async () => {
      console.log('geolocate');
      return "0.0.0.0";
    });

    jest.spyOn(client, 'sendToMicroservice').mockImplementation(async () => {
      console.log('sendToMicroservice')
      return;
    });
  });

  it('sends events to the platform', () => {
    const event = { type: 'test' };
    client.trackEvent(event);
  });

  it('Does not send events if no installation ID is set, and sends them when set', async () => {
    expect(client.dispatchQueue.paused).toEqual(true);

    client.trackEvent({ type: 'test' });
    expect(client.dispatchQueue.length()).toEqual(1);
    expect(client.processEvent).not.toHaveBeenCalled();

    client.trackEvent({ type: 'test' });
    expect(client.dispatchQueue.length()).toEqual(2);
    expect(client.processEvent).not.toHaveBeenCalled();

    const id = '1234';
    client.setInstallationId(id);

    // Artificially wait for the queue to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(client.dispatchQueue.paused).toEqual(false);
    expect(client.dispatchQueue.length()).toEqual(0);
  });
})