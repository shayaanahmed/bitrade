# Operations, Security, Backup, and Recovery

## Deployment

Copy `.env.example` to `.env`, provide only required read-only credentials, and run `docker compose up --build`. The web service listens on the configured host port, the existing scanner remains separately executable, and named volumes preserve scanner plus local D1/R2 development state. Hosted Sites deployments use logical `DB` and `ARTIFACTS` bindings from `.openai/hosting.json`.

Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run lint` before production promotion. Apply checked-in Drizzle migrations before serving writes. Health is `/api/health`; metrics are `/api/metrics`.

## Security

- Use read-only Binance credentials. Trading and withdrawal permissions must remain disabled.
- Secrets are server-only environment values and must not use a public prefix.
- Sites mutations use authenticated-user headers; development permits localhost only.
- Mutation routes enforce same-origin requests. Inputs have body limits and strict enum/numeric validation.
- Audit records contain actor, action, resource, reason/detail, and UTC time. Do not log request headers or bundle secrets.
- Real-money execution is unavailable even if an obsolete environment flag is present.

## Backup

Stop writers or take a platform-consistent snapshot. Back up the D1 database, the complete R2 artifact bucket, the Compose `research-state` and `signal-state` volumes, deployment configuration, and the exact source commit. Encrypt backups, restrict access, and test restoration regularly.

## Restore

Deploy the recorded source commit, apply migrations, restore D1 first and R2 second, then restore scanner state. Verify dataset and bundle checksums, run bundle parity vectors, call health/metrics, and resume paper sessions only after their last event timestamp and positions match the audit trail. Never edit a deployed model artifact during recovery; promote a preserved version through the registry.

## Retention and failure handling

Jobs use idempotency keys and record attempts, terminal error, progress, and cancellation intent. Paper events use per-session checksums to ignore duplicates. Provider failures remain visible and are never replaced with fabricated candles. Retention may delete unreferenced raw datasets only after an auditable policy confirms no experiment, model, or paper record depends on them.
