# 0011: Durable user notification inbox

Status: proposed

Related issue: [#293](https://github.com/orienteerfeed/orienteerfeed/issues/293).

Store personal inbox messages in MariaDB in the transaction that creates their
source order or payment receipt. Deduplicate by recipient and source key. Use a
pending-publication timestamp on the message as a transactional outbox; a worker
publishes invalidation hints through the existing PubSub/Redis bridge. Clients
recover missed hints from SQL via queries and periodic reconciliation.

This extends the existing feature service boundaries and SQL-as-history approach.
It does not replace the specialized Expo bank-push outbox or alter email delivery.
User JWT and current event ownership authorize inbox access. Retain messages for
90 days and erase them on account anonymization.

Alternatives: deriving history from live subscriptions loses offline messages;
writing after commit can lose notifications on process failure; introducing a
separate broker is unnecessary for this bounded first version. Duplicate delivery
hints across replicas are acceptable because inbox records remain unique.
