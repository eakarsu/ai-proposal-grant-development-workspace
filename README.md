# Proposal & Grant Development Workspace

The primary application is the root Next.js workspace. It provides validated records, independent review, saved AI drafts, complete selected evidence, and the domain tools listed below. AI output is advisory text; risk/confidence values and operational completion are never fabricated.

## Implemented behavior

- Every AI workflow includes three named example buttons. Each fills all workflow inputs, including optional fields, and replaces previous values. The example label remains visible while you edit; **Clear fields** resets the inputs. Select real subject/evidence records separately, then use **Generate and save draft** when ready.
- ADMIN manages accounts and can delete records; MANAGER creates/edits records, runs tools, and reviews other users' work; ANALYST reads records and responds to sessions assigned to them.
- Searchable server pagination exposes all records. Relationship selectors validate referenced records, numeric/date fields are checked, stale edits fail safely, and failed saves retain form contents.
- Imports accept up to 500 JSON rows / 1 MB with validation, duplicate-dataset detection, transactional writes and audit history.
- Two distinct reviewers, excluding the last editor, approve a saved record version. Editing it invalidates approval. External actions require approval of the exact submitted version.
- Selected database records retain full strings, nested values and ISO dates. Sources are scoped by parent and linked subject. Oversized evidence is rejected, not silently truncated.
- Text/CSV/JSON/Markdown source content can be uploaded, independently reviewed and included in drafts. Approved-source proposal drafting verifies quoted excerpts. Semantic support still requires human review.
- AI requests have a 45-second deadline, bounded input/output, and a persistent 20-call/user/hour allowance. Missing credentials, refusals and malformed output return errors. Successful drafts are saved server-side with source snapshots, hashes, model and provider receipt.
- Credential, badge and employer-transcript records, where present, receive an opaque verification URL after two independent reviews. Verification reports local human-reviewed issuance, not external accreditation.
- Timed assignments/simulations/oral sessions, where present, preserve responses and WebM recordings. Independent human scores drive question sequencing. Server deadlines and reviewer separation are enforced; there is no authorship-probability model.

## Domain tools

- **Ledger reconciliation**: Compare debits and credits using integer minor units in a single currency.
- **Evidence completeness checklist**: Check whether supplied requirements have supporting text. Presence does not prove truth or compliance.
- **Missed commitment detection**: Compare complete due dates with an explicit as-of timestamp. No follow-up is sent automatically.

The dashboard record counters are labeled as counts. Calculated measures are available under **Domain tools** with the actual inputs, method, limitations and saved result. Example datasets are visibly identified.

## External capabilities

Actual submissions, wire/payoff verification, source-system polling, FHIR Plan-Net conformance, geospatial adequacy checks, SCM/HRIS/telemetry ingestion and versioned regulatory/actuarial engines need a configured domain service. They are **unavailable until configured**, and are not implemented by changing a status or asking a model.

`DOMAIN_CONNECTORS_JSON` configures trusted HTTPS adapters. `/tools` exposes their real health checks and allowed actions. `docs/CONNECTORS.md` defines the required contract. Actions bind to an approved record hash and an idempotency key; a matching external receipt is required. An uncertain execution is not automatically repeated.

## Local setup and operation

Use Node 22 LTS (or a compatible Node 20.19+ runtime) and PostgreSQL. Configure `DATABASE_URL`, a random `NEXTAUTH_SECRET` of at least 32 characters, and `NEXTAUTH_URL`. Set `OPENROUTER_API_KEY` only when you want live AI drafts; never commit secrets. `PORT` overrides the project's default port.

```sh
npm ci
npm run db:generate
npm run db:deploy
npm run build
npm start
```

The new migrations add review, source, analysis, execution, account-state and work-session tables without deleting existing data. The Medicare/teacher apps also add explicit subject/evidence relations. Existing unlinked records must be associated with the correct subject before editing or approving; the migration does not guess those relationships.

Administrators can provision additional independent reviewers at `/users`. For an existing account password reset, set `NEW_ACCOUNT_PASSWORD` in the shell and run `node scripts/admin-password.mjs account@example.com`; do not pass passwords in command-line arguments. If no accounts exist, the script bootstraps the first administrator. Reset old demonstration passwords before exposing an instance.

Demo seeding is opt-in, disabled in production, and restricted to `demo_` or `inspection_test_` databases. It requires `ALLOW_DEMO_SEED=true` and a custom `DEMO_PASSWORD` of at least 16 characters. It must never be used on an application database to clean up tests.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev
```

`node scripts/integration-test.cjs` requires a fresh migrated `inspection_test_` database supplied through `DATABASE_URL`. It exercises real PostgreSQL transactions with synthetic session/provider fixtures. Use disposable test databases only. Builds and fixtures do not constitute clinical, legal, underwriting, hiring, or psychometric validation.
