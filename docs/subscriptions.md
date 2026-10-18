# Subscriptions

Plans centrally configure the six-month price and the 24-month discount (10% by default). A 24-month price is four times the six-month price less the configured discount. Platform admins create payment-pending subscriptions, verify and activate them, extend, suspend, reactivate, or cancel. Each transition writes immutable subscription history and an audit event.

Active periods receive a 14-day read-only grace marker. Once the end date passes—or a subscription is expired, suspended, or cancelled—the API rejects mutations while preserving read access and all tenant data.
