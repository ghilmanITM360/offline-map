# Secure Google Walking Routes Proxy Contract

## Status

Mobile contract and mocks implemented. Deployment blocked pending backend-platform approval.

Repository contains no approved backend runtime, hosting config, server secret store, rate limiter, or app-to-proxy authentication system. This specification is deployment-neutral and must not be used to infer platform approval.

## Security Boundary

```text
mobile app
  -> HTTPS proxy with no Google credential in request
  -> server-held restricted Google Routes credential
  -> fixed Google Routes API endpoint
```

Google Maps Android/iOS SDK keys remain separate client-visible rendering credentials. They must never be reused for Google Routes web-service calls.

Mobile configuration may contain only:

```text
EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL
```

No `EXPO_PUBLIC_*` variable may contain Google Routes credential, proxy signing secret, or privileged bearer token.

## Endpoint

```http
POST /v1/outside-walking-routes:compute
Accept: application/json
Content-Type: application/json
```

Proxy enforces `WALK`; client cannot request driving, cycling, motorcycle, transit, or other modes.

## Request

```json
{
  "schemaVersion": 1,
  "requestId": "opaque-mobile-request-id",
  "requestVersion": 7,
  "mode": "WALK",
  "origin": { "latitude": 24.96, "longitude": 67.01 },
  "gates": [
    {
      "gateId": "GATE_05",
      "routeTargetCoordinate": { "latitude": 24.961, "longitude": 67.011 }
    }
  ]
}
```

Validation requirements:

- exact method and JSON content type
- bounded request body and gate count
- schema version 1
- opaque non-empty request ID and positive safe-integer version
- finite WGS84 coordinates within latitude/longitude ranges
- coordinates within owner-approved Karachi/Ijtema service bounds
- unique gate IDs matching `GATE_NN`
- gate IDs present in server-side canonical allowlist/version
- route target matches server canonical connector target within approved tolerance
- mode exactly `WALK`
- reject unknown privileged fields

Client-supplied gate coordinates are routing inputs, not authority. Proxy must validate them against server-side gate data before Google request.

## Success Response

Every requested gate must appear exactly once as routed or unreachable. Partial/indeterminate gate sets return safe error instead of silently excluding a possible optimum.

```json
{
  "schemaVersion": 1,
  "requestId": "opaque-mobile-request-id",
  "requestVersion": 7,
  "outcomes": [
    {
      "status": "routed",
      "gateId": "GATE_05",
      "routes": [
        {
          "routeId": "server-opaque-route-id",
          "distanceM": 180,
          "durationSeconds": 140,
          "coordinates": [
            { "latitude": 24.96, "longitude": 67.01 },
            { "latitude": 24.961, "longitude": 67.011 }
          ],
          "steps": [
            {
              "id": "step-1",
              "maneuver": "turn-left",
              "distanceM": 80,
              "durationSeconds": 60,
              "coordinate": { "latitude": 24.9605, "longitude": 67.0105 },
              "instruction": "Turn left",
              "roadName": "Public Road"
            }
          ],
          "warnings": []
        }
      ]
    }
  ]
}
```

Allowed maneuver values:

```text
depart, continue, slight-left, slight-right, turn-left,
turn-right, u-turn, arrive, unknown
```

Unreachable outcome:

```json
{
  "status": "unreachable",
  "gateId": "GATE_05",
  "reason": "no-route"
}
```

Response must not include raw Google payload, encoded credential, upstream request headers, billing project, debug stack, precise-location log identifier, or unrestricted upstream URL.

Normalized geometry must begin within 100m of requested origin and end within 100m of declared gate route target. When multiple gate targets are present, endpoint must not be closer (with 2m comparison margin) to another gate target than declared gate. Mobile repeats these checks before core finalization; mismatch is `malformed-response`.

## Safe Errors

HTTP mapping:

| HTTP | Mobile code | Retryable |
| --- | --- | --- |
| 400/422 | `invalid-request` | no |
| 401/403 | `proxy-unavailable` | yes after operator correction |
| 429 | `rate-limited` | yes, respecting bounded `Retry-After` |
| 500-599 | `provider-server-error` | yes |
| client timeout | `timed-out` | yes through OSM fallback |
| network failure | `proxy-unavailable` | yes through OSM fallback |

Error body contains only stable code, optional bounded retry delay, request identity, and safe generic message. Never forward Google error text verbatim.

## Upstream Request Rules

- fixed Google Routes API host/path; no user-controlled upstream URL
- walking travel mode only
- public-road walking geometry
- explicit field mask limited to route geometry, distance, duration, steps, maneuver, road/street label, and warnings required by contract
- bounded server timeout shorter than mobile timeout budget
- cancellation propagated when runtime supports it
- no unbounded retry; at most owner-approved bounded retry for idempotent transient failure
- response size and candidate count capped
- Google attribution/licensing requirements preserved where applicable

## Rate Limiting and Abuse Control

Implementation requires owner approval for:

- client authentication or attestation mechanism
- rate-limit identity
- per-minute/day limits
- Google billing/quota ceiling and alerting
- deployment region
- retention and incident-response policy

Until approved, proxy deployment must not occur.

## Logging and Privacy

Allowed operational fields:

- opaque request ID
- schema version
- provider outcome code
- latency bucket
- candidate count

Disallowed by default:

- exact origin or gate coordinates
- full route geometry or steps
- raw request/response body
- Google credential or authorization headers
- device/person identifiers joined to route request

Any location-log exception requires explicit owner-approved purpose, retention, access control, and deletion policy.

## Mobile Fallback

```text
proxy success -> normalized Google candidates
proxy safe failure/timeout -> bundled OSM provider
OSM failure -> direct-direction guide
external cancellation -> stop; no fallback
```

Mobile client performs one proxy attempt per request and no automatic retry loop. Direct guide remains visibly labelled as not road navigation.

## Verification Boundary

Automated mobile tests verify request validation, walking-only payload, timeout, cancellation, safe HTTP mapping, response normalization, fallback order, and absence of credential fields in normalized results.

Still unverified until backend approval/deployment:

- real Google Routes request
- secret-manager access
- rate limiting and abuse controls
- billing/quota enforcement
- upstream field mask and attribution
- production timeout/cancellation behavior
- server logs and privacy controls
