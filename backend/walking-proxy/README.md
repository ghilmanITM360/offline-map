# Private internal walking proxy (#123)

This is staging preparation, not a deployed provider or completed #123.
No mobile/UI changes. Node24 built-in HTTP/fetch, no server dependencies.
Contract matches `GoogleRoutesProxyContract.ts`. The server returns outside
candidates only; it does not select the complete journey/gate or add endpoint
join cost (core already handles that in #171).

## Security / configuration

- `GOOGLE_ROUTES_API_KEY`: server-only Secret Manager value, Routes API-only
  credential; never reuse the Android Maps rendering key or put it in mobile.
- `PORT`: Cloud Run supplied (local default8080 on127.0.0.1).
- `GET /healthz`: 200 ready if key configured, 503 otherwise; reveals no key.
  This is configuration readiness, not a provider connectivity test.
- Cloud Run IAM must require authorized invokers. **Never deploy with
  `--allow-unauthenticated`**. Manifest/container alone does not enforce IAM.
- The existing mobile client sends no credential. Private IAM alone therefore
  does not satisfy mobile→proxy acceptance. A trusted host ingress/access
  design is still required; do not embed a privileged invoker token in APK.
- Origin is sensitive: no application request/coordinate/key logging or cache.
  Cloud platform request/access logs and retention must be reviewed at deployment;
  coordinate processing/third-party transfer needs owner-approved disclosure.
- Valid lat/lon, WALK-only, same token/version,1–16 distinct verified gate IDs
  with canonical targets;16KiB request;3s provider deadline; bounded geometry and2MB provider response.
- Default60 paid gate calls/minute **per process**. Counter resets on restart,
  not a durable project billing quota. Use provider quotas/budget alerts plus
  max1 instance/concurrency1 for staging. Do not call this internet-wide abuse
  protection. Private IAM is the access boundary.
- Errors are redacted; non-2xx causes existing mobile OSM/direct fallback.
  Provider redirects are refused. Health never bills provider.

## Local validation

```bash
npm run test:walking-proxy
```

Tests use injected provider fixtures, never a paid request or real GPS.
`gates.json` is a reviewed deployment snapshot of verified canonical gate
coordinates, excludes18/19. Update it alongside approved venue gate changes;
never invent a connector. Require the snapshot parity test before deployment.

## Deployment boundary / commands

Existing account project `map-app-496712` is accessible, but Routes/Cloud Run
APIs are disabled (2026-10-01). Owner staging/billing approval remains pending.
Commands below are preparation; not recorded as executed:

```bash
gcloud services enable routes.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project map-app-496712
# Provision dedicated Routes-only key in Secret Manager without printing/logging it.
# Give the dedicated runtime service account access ONLY to that secret.
gcloud run deploy ijtema-walking-proxy-staging --project map-app-496712 --region asia-south1 --source backend/walking-proxy --no-allow-unauthenticated --service-account ROUTES_RUNTIME_SERVICE_ACCOUNT --set-secrets GOOGLE_ROUTES_API_KEY=ROUTES_SECRET_NAME:SECRET_VERSION --min-instances 0 --max-instances 1 --concurrency 1 --memory 256Mi --timeout 5s
```

`ROUTES_RUNTIME_SERVICE_ACCOUNT`, `ROUTES_SECRET_NAME`, `SECRET_VERSION` are
names/placeholders, not credentials. Grant run.invoker only to intended staging
operators/trusted gateway; audit IAM after deployment. Real health/WALK request
with server-only identity, actual provider response, endpoint joins (#161),
network-loss/fallback and mobile trusted access remain separate acceptance.
Do not enable the mobile diagnostic proxy flag until these boundaries resolve.

Provider reference: [computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes).
WALK routes may omit pedestrian paths/sidewalks; return the caution to client.
