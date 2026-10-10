# NovBank safe deployment procedure

## Environment separation

The upgrade branch must use a staging MongoDB deployment and staging credentials. Production credentials must never be copied into local development or staging.

Recommended configuration:

- `NODE_ENV=staging`
- `MONGODB_URI=<staging connection string>`
- `MONGODB_DB_NAME=novbank-staging`
- `ALLOW_PRODUCTION_DATABASE` unset or `false`

Production should explicitly use:

- `NODE_ENV=production`
- `MONGODB_URI=<production connection string>`
- `MONGODB_DB_NAME=novbank-production`
- `ALLOW_PRODUCTION_DATABASE=true`

The application refuses to start when a non-production environment is pointed at a production-named database.

## Before promoting an upgrade

1. Back up the production database and verify that the backup can be restored.
2. Deploy the upgrade to staging.
3. Run authentication, account, transaction, card, deposit, withdrawal and admin regression tests.
4. Compare balances and transaction totals using read-only verification tooling.
5. Review database migrations before running them.
6. Use backward-compatible schema changes whenever possible.
7. Deploy the application only after the staging checks pass.
8. Immediately perform read-only production smoke checks after deployment.
9. Keep the previous application version available for rollback.

## Financial-data rule

Application startup and deployment must never initialize, reset, seed, or recalculate customer balances in production. Balance changes must occur only through explicit financial transaction workflows with audit records and idempotency controls.
