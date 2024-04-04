# Comments for vercel.json

Here, we have several redirection rules. Each rule is an object with `source`, `destination`, and `permanent` properties.

- `source`: This is the path that will be matched in the incoming request.
- `destination`: This is the path that the request will be redirected to if the `source` matches.
- `permanent`: If `true`, the redirection will be a 301 (permanent) redirect. If `false`, it will be a 302 (temporary) redirect.

## Line 78-82 in vercel.json

The last rule in this excerpt is a catch-all rule that matches any path that doesn't start with `en`, `_next/static`, `_next/image`, `assets`, `protocols`, `favicons`, `images` or `.*\\.\\w+.*`(This regular expression is used to match any path that contains a file extension - i.g: _icon.svg_)

```JSON
{
  "source": "/:path((?!en|_next/static|_next/image|assets|protocols|favicons|images|.*\\.\\w+.*).*)",
  "destination": "/en/desktop/:path*",
  "permanent": true
}
```

The above rule redirects matching requests to the `/en/desktop/:path*` path.
