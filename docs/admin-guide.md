# Platform administrator guide

Use `/api/v1/platform/plans` to maintain pricing and `/api/v1/platform/subscriptions` to list/create subscriptions. Transition a subscription with `PATCH /api/v1/platform/subscriptions/:id` using `ACTIVATE`, `EXTEND`, `SUSPEND`, `REACTIVATE`, or `CANCEL`. Include payment method, reference, amount, and reason where applicable. Review immutable history at `/api/v1/platform/subscriptions/:id/history` and platform audit logs before resolving support cases.
