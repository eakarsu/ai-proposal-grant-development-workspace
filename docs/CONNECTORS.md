# Domain service adapter contract

No domain services are configured by default. Adapters are server-side integrations under the operator's control. Do not put endpoint credentials in frontend configuration.

Set DOMAIN_CONNECTORS_JSON to an array such as:

```json
[{"id":"submission-service","label":"Submission service","endpoint":"https://service.example.invalid/domain-adapter","token":"SECRET_FROM_DEPLOYMENT_SETTINGS","actions":["submit"],"schemaVersion":"1"}]
```

The root application reads only this server configuration. Request bodies cannot supply an endpoint. Redirects and credential-bearing URLs are rejected.

GET `<endpoint>/health` must return `{ "status": "ok", "schemaVersion": "1" }`. This checks reachability/contract only, not validity of domain records.

POST `<endpoint>/execute` receives `{action, entity, record, recordHash, approvalId, idempotencyKey}` and an `Idempotency-Key` header. The adapter must enforce the relevant domain rules, authorization, source checks and operation-specific prerequisites, then execute through the real target system. It must deduplicate the key and return `{ "status": "completed", "schemaVersion": "1", "receiptId": "actual-target-receipt", "idempotencyKey": "same-key" }` only after actual completion. A health response cannot be reused as a completion receipt.

The application saves a pending execution before sending. It retains matching receipts and will return an existing receipt on repeat requests. A timeout or uncertain response requires reconciliation against the adapter's idempotency key; do not retry by changing record fields to manufacture a new key. An operator must investigate uncertain executions in DomainExecution and the service's receipt ledger.

Regulated decisions require appropriately versioned rule sets and domain validation outside a generic LLM prompt. Configure only services whose contract and domain behavior have been tested. No third-party submissions, transfers, messages or verification calls were made during the code repair.
