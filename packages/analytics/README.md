# @codaco/analytics

This npm package implements methods and types for sending analytics and errors from Fresco instances to a custom error and analytics microservice.

It exports two functions:

**createRouteHandler** - A function that creates a NextJs route handler which geolocates requests, and forwards the event payload to the microservice.

**makeEventTracker** - A function that returns a `trackEvent` function, which attaches timestamp data to an event, and then calls the route handler.
