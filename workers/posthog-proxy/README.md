# PostHog Cloudflare Worker Reverse Proxy

This Cloudflare Worker acts as a reverse proxy for PostHog analytics, forwarding requests from `ph-relay.networkcanvas.com` to PostHog Cloud (US region).

## Why Use a Reverse Proxy?

1. **Security**: Keep your PostHog API key server-side
2. **Ad-blocker Bypass**: Some ad-blockers block `posthog.com` domains
3. **Custom Domain**: Use your own domain for all analytics traffic
4. **Performance**: Cloudflare's edge network provides low-latency proxying

## Deployment Instructions

### 1. Create the Worker in Cloudflare

1. Log in to your Cloudflare dashboard
2. Navigate to **Workers & Pages** > **Create Application** > **Create Worker**
3. Name it something like `posthog-proxy` (or use the default name)
4. Click **Deploy** to create the worker

### 2. Add Worker Code

1. Click **Edit code** on your newly created worker
2. Replace all existing code with the contents of `posthog-proxy.js`
3. Click **Save and Deploy**

### 3. Configure Custom Domain

1. Go to the worker's **Settings** tab
2. Navigate to **Triggers** section
3. Under **Custom Domains**, click **Add Custom Domain**
4. Enter: `ph-relay.networkcanvas.com`
5. Click **Add Custom Domain**

Cloudflare will automatically:
- Create the necessary DNS records
- Provision SSL/TLS certificates
- Route traffic from your custom domain to the worker

### 4. Test the Proxy

Test that the proxy is working:

```bash
# Test the ingest endpoint
curl -X POST https://ph-relay.networkcanvas.com/capture \
  -H "Content-Type: application/json" \
  -d '{"api_key":"YOUR_POSTHOG_API_KEY","event":"test_event","properties":{}}'

# Should return a PostHog response (usually {"status": 1})
```

### 5. Update Analytics Configuration

In your applications using the `@codaco/analytics` package, set:

```env
NEXT_PUBLIC_POSTHOG_HOST=https://ph-relay.networkcanvas.com
NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_api_key_here
```

## How It Works

### Request Flow

```
Client App
    |
    | POST /capture (with events)
    |
    v
ph-relay.networkcanvas.com (Cloudflare Worker)
    |
    | Proxy request to PostHog
    |
    v
us.i.posthog.com (PostHog US Cloud)
```

### Path Routing

- **API/Ingest requests**: `/*` → `us.i.posthog.com/*`
- **Static assets**: `/static/*` → `us-assets.i.posthog.com/static/*`

### CORS Handling

The worker automatically handles CORS:
- Accepts `OPTIONS` preflight requests
- Adds appropriate `Access-Control-Allow-*` headers
- Allows requests from any origin

## Monitoring

Monitor your worker in the Cloudflare dashboard:

1. Go to **Workers & Pages** > select your worker
2. Click **Metrics** to view:
   - Request volume
   - Error rates
   - CPU time
   - Response times

## Environment Variables

The worker doesn't require environment variables in basic configuration, but you can add them if needed:

- Go to **Settings** > **Variables**
- Add any required variables
- Redeploy the worker

## Cost Estimates

Cloudflare Workers pricing (as of 2025):
- **Free tier**: 100,000 requests/day
- **Paid plan**: $5/month for 10M requests + $0.50 per additional million

Given typical analytics usage, the free tier should be sufficient for most deployments.

## Troubleshooting

### Worker not receiving requests
- Verify DNS is pointing to Cloudflare
- Check custom domain is properly configured
- Ensure SSL/TLS mode is "Full" or "Full (strict)"

### CORS errors
- Verify the worker is adding CORS headers (check Network tab)
- Ensure the worker code includes the `handleOptions()` function
- Check that client is sending proper `Origin` header

### 524 timeout errors
- PostHog might be slow to respond
- Consider adding timeout handling in the worker
- Check PostHog status page: status.posthog.com

## Alternative: Cloudflare Pages

If you're also hosting a site on Cloudflare Pages, you can use `_redirects` file instead:

```
/ingest/* https://us.i.posthog.com/:splat 200
/static/* https://us-assets.i.posthog.com/:splat 200
```

However, the Worker approach provides more flexibility and better CORS handling.

## Security Considerations

- The PostHog API key is sent from the client, so it's still public
- This is expected - PostHog's public API key is designed for client-side use
- Sensitive operations (deleting data, etc.) require a different private key
- The proxy helps avoid ad-blockers and provides a stable endpoint you control

## Additional Resources

- [PostHog Proxy Documentation](https://posthog.com/docs/advanced/proxy/cloudflare)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [PostHog US Cloud](https://us.posthog.com)
