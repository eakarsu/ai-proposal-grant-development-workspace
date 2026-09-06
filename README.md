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

## Local sample data

After configuring the existing administrator and deploying migrations, run
`npm run demo-data:load` to add fictional sample records to the local database.
`npm run demo-data:verify` also reloads them and verifies that records and the
administrator are unchanged. Records persist across restarts; existing edits are
preserved and deterministic IDs prevent duplicates.

To restore missing samples during local startup, set `LOAD_DEMO_DATA=true` in the
ignored `.env`. It defaults to false. The loader refuses production mode and remote
databases. It does not send messages, run AI, charge cards, or manufacture provider
receipts. Demo requests remain pending/draft and demo promotions remain inactive.
Appointment dates are set on the first load and are preserved thereafter; use the
date controls to view them on later days.

Use `demo-data:load` for an existing workspace. The older `db:seed` command resets
a dedicated demo/test database and is not an additive loader. New source artifacts
are explicitly fictional and unapproved; they are not evidence of a real funder.

When running the portfolio locally, include `connection_limit=2&pool_timeout=30`
in the PostgreSQL `DATABASE_URL` query parameters to keep simultaneous apps from
exhausting the shared database connection limit. Restart after changing .env.


## Proposal projects and organizations

Sign in at `/login` to open `/projects`. Original administrators can create an organization at `/organizations`, create a proposal, and invite named editors, independent reviewers and clients. Invitation links are shown once, expire after seven days, and can be revoked; this app does not send them automatically. Existing invitees must sign in with the matching email. Clients can only download approved frozen packages for assigned projects. Existing generic records remain restricted to original-workspace members.

Upload TXT, DOCX or PDF evidence in a draft proposal, have another reviewer approve sources, and cite exact excerpts in sections and budget policies. Save revisions explicitly. Complete requirements and budget reviews before requesting independent proposal approval. Managers can then freeze actual PDF/DOCX/ZIP files. Recording a submission requires a manual receipt reference and actual submission time; it does not submit to a funder or verify the receipt externally.

Text extraction runs in bounded child processes. Scanned PDF pages require local `pdftoppm` (Poppler) and `tesseract` with English language data on the server PATH; install these dependencies on deployment hosts. Extraction rejects oversized files, excessive pages, timeouts and malformed input. Limits are 5 MB/file, 100 PDF pages, 20 OCR pages and 100 sources/project, with 50 MB total originals and 3 MB extracted evidence per project. OCR output requires human review. PDF exports use the bundled OFL Noto Sans font; unsupported characters produce an explicit error. To use a broader font, place a licensed WOFF/TTF/OTF file in `assets/grant-fonts/` and set `GRANT_PDF_FONT_FILE` to its basename.

Run `npm run test:grants:isolated` against local PostgreSQL to create, migrate, test and remove a disposable database. It covers real extraction/OCR, exact budgets, access boundaries, approvals and immutable exports, then runs the legacy route suite. See `FEATURE_STATUS.md` for implemented scope and remaining work. Updating the app now invalidates old sessions once; sign in again.

Run `npm run test:restore` to create a private backup, restore it into a disposable local PostgreSQL database, and read all restored public tables. It requires local PostgreSQL tools and permission to create a temporary database. The backup remains under `~/.codex/backups/<project>/`; the temporary database is removed after the check. The September 6 full restore rehearsal passed.

Each grant project now has an **AI drafts** tab. Save the proposal, obtain independent approval of source evidence, select the sources and confirm sharing authorization before generating. Section drafts and review findings remain separate from the proposal. Applying a reviewed section requires an unchanged proposal/evidence snapshot and saves a new revision; it never bypasses independent proposal approval. Unknown requests are held rather than automatically regenerated.

Configure `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` for generation. Optional `GRANT_AI_DAILY_LIMIT` (default 50) and `GRANT_AI_DAILY_REPORTED_COST_USD` (default 10) limit organization usage based on recorded requests/reported cost. They cannot guarantee a provider's final bill when cost is unreported. The latest isolated tests include AI provider fixtures, exact source quotations and review/application safeguards; no live provider acceptance is claimed.

### Source replacement and submission receipt attachments

In a draft project's **Sources** tab, choose **Source version → Replace** to upload a new version of the latest source. The previous original remains downloadable. Replacement revokes its current approval and records the change in revision/audit history; update citations and obtain independent approval for the new source. Competing replacements of the same version are rejected. Existing frozen export packages retain their original files and manifest.

After recording the actual submission reference, use **Reviews & export → Submission receipt files** to attach the funder confirmation or supporting evidence. Managers can attach PDF/PNG/JPEG/UTF-8 text with storage/sharing confirmation and contextual notes. Staff and reviewers with project access can download exact originals. Receipt files are append-only, capped at 5 MB each and 10 files / 25 MB per package; add another file to document a correction. Uploading a receipt does not establish automatic funder verification. Client package access does not include original receipt files.

Local restart behavior: `./start.sh` clears this project’s configured ports before migrations or builds. It stops the prior project server tree, waits for release and verifies the ports are free. If another application owns a configured port, startup stops with an explanation instead of terminating that application. Run `npm run test:startup` to verify both cases.

Local autofill is enabled by `ENABLE_DEMO_CREDENTIAL_AUTOFILL=true` in the ignored `.env`, with the existing administrator credentials configured there. The login button checks availability without retrieving passwords, then fills the configured account when clicked. Availability and credential responses are never cached.
