# Feature status — Proposal & Grant Development Workspace

Assessed September 6, 2026 from the local source, read-only database queries,
the two Desktop screenshots taken at 10:23, and the existing automated tests.

The sections through the original verification are a historical baseline. See the implementation checkpoint below for subsequent changes.

## Verdict

This is a functioning single-workspace application foundation, not a complete
grant discovery, authoring, submission, and post-award management product.
The screenshots confirm successful administrator login and dashboard rendering.
They do not demonstrate completed submissions, live AI calls, or production readiness.

All twelve dashboard counts currently equal 40; read-only database queries
confirmed those counts. The database includes generic sample-style records
(for example, an opportunity named `Name 001`), and an additive fictional-data
loader exists. Record counts must not be presented as successful grant outcomes.

The local `.env` currently has neither `OPENROUTER_API_KEY` nor
`DOMAIN_CONNECTORS_JSON` configured. An externally supplied process environment
could differ. No live AI generation or external submission was tested in this
assessment, and no credentials were copied from another project.

## Existing capabilities

“Implemented” below means an implementation was found in source; it does not
mean every workflow has received browser or production acceptance testing.

| Capability | Status | Evidence and limits |
| --- | --- | --- |
| Administrator login and dashboard | Observed | User screenshots show signed-in ADMIN; counters confirmed against PostgreSQL. |
| ADMIN / MANAGER / ANALYST permissions | Implemented | `src/lib/api-auth.ts` reloads current account state; record policy controls writes/deletes. This is not organization-level tenant isolation. |
| Opportunities, proposals, requirements, deadlines | Implemented foundation | Configured record forms, database models, validation, search/pagination and parent references. Complete business workflows remain to be built. |
| Drafts, meeting extracts, budget lines, reviewer assignments, compliance and submission records | Implemented foundation | Stored records exist; a status field is not an actual external action or financial calculation. |
| JSON import and draft download | Implemented foundation | Import validation and duplicate protections exist; AI drafts can download as Markdown. A formatted funder-ready proposal package is not established. |
| Independent record review | Implemented | Reviews bind to the current record version; two independent reviewers are required for record approval. |
| Source ingestion and independent source review | Implemented for text | Text content is stored with a hash and subject reference; source approval is distinct from two-reviewer record approval. Native PDF/DOCX parsing and OCR are not established. |
| Go / No-Go AI draft | Implemented, provider not configured locally | `src/config/app.ts` and `src/app/api/ai/[workflow]/route.ts`; advisory output, not calibrated win probability. |
| Proposal section AI draft | Implemented, provider not configured locally | Requires approved selected source artifacts and checks quoted excerpts. Human review must assess semantic support. |
| Claim audit AI draft | Implemented, provider not configured locally | Rejects invented source references; does not independently prove claims. |
| Saved AI evidence and provenance | Implemented | Source snapshots/hash, model and provider receipt saved with successful draft. |
| AI request controls | Implemented foundation | Bounded inputs/output, timeout, persistent 20-call/user/hour allowance; no established organization dollar budget. |
| Ledger comparison, evidence presence, missed deadlines | Implemented calculators | `src/lib/domain-engine.ts`; supplied inputs only, no ledger posting or automatic reminders. |
| External execution adapter | Framework only; unconfigured locally | Configured HTTPS adapter, exact-version approval and receipt/idempotency contract. No native funder submission integration established. |

## Prioritized feature backlog

The following are proposed additions or expansions, not claims of implementation.
“All possible features” is open-ended; these are concrete capabilities with
reviewable completion criteria. A feature is complete only when its UI, server
behavior, permissions, persistence, errors and relevant verification are complete.

### 1. Complete the core grant workflow

- [ ] Proposal-centered overview with linked opportunity, owners, requirements, drafts, budget, reviews and submission history.
- [ ] Enforced lifecycle transitions with required fields, approval gates, audit history and stale-edit protection.
- [ ] Actionable dashboard: upcoming deadlines, overdue work, approval queues, requested funding and outcome measures with defined formulas.
- [ ] Task assignment, comments, mentions, notifications and calendar views; delivery consent/configuration and delivery receipts for external notifications.
- [ ] Requirement-to-section-to-evidence traceability and coverage, with human-reviewed eligibility and allowability decisions.
- [ ] Proposal templates, reusable approved organization narratives, section version comparison and rollback.
- [ ] Search/filter improvements, bulk operations, accessible empty/error/loading states and responsive navigation.

### 2. Documents, budgets and submission packages

- [ ] PDF/DOCX ingestion, OCR for scanned sources, page/paragraph citations, source versions and ingestion error reporting.
- [ ] Structured proposal editor with headings, tables, attachments, word/page limits and autosave conflict handling.
- [ ] DOCX/PDF/package export with cover page, table of contents, attachments, reference list and reproducible version manifest.
- [ ] Exact decimal/minor-unit budgets, quantity/rate formulas, personnel effort, fringe, indirect costs, cost share and multi-year scenarios.
- [ ] Funder-specific validation rules with versioned provenance and configurable requirements.
- [ ] Submission checklist, approval snapshot, package freeze, receipt upload and reconciliation of uncertain submissions.
- [ ] Actual funder submission adapters only where supported, with credentials, sandbox contract tests and verified target receipts.

### 3. Additional AI workflows

- [ ] Opportunity fit explanation using an approved organization profile and cited eligibility evidence.
- [ ] Solicitation requirement extraction, deadlines and eligibility questions with source locations for confirmation.
- [ ] Proposal outline, executive summary, rewrite, translation and reviewer-feedback revision with trackable changes.
- [ ] Budget justification drafting grounded in calculated budget lines.
- [ ] Cross-section consistency checks for names, dates, amounts, outcomes and commitments.
- [ ] Reviewer rubric feedback, missing-evidence detection and citation-supported improvement suggestions.
- [ ] Source-library question answering with permission checks, retrieval citations and explicit unanswered questions.
- [ ] Meeting transcription/action extraction with recording consent and human confirmation before assigning work or sending messages.
- [ ] AI job history, cancellation/recovery, duplicate-request handling, actual usage/cost controls and evaluation datasets.
- [ ] Human approval before applying consequential changes; AI drafts must not silently submit applications or contact funders.

### 4. Discovery, collaboration and post-award operations

- [ ] Configured opportunity-feed ingestion, deduplication, saved searches, eligibility filters and deadline-change alerts.
- [ ] Organization/team isolation, invitations, project access, external reviewer access and configurable approval policies.
- [ ] Calendar, document storage, CRM and accounting connectors with scoped credentials, retry/reconciliation and observable status.
- [ ] Award decisions, agreements, milestones, deliverables, actual spending, reporting obligations and renewal tracking.
- [ ] Outcome reporting and portfolio analytics separating submitted, awarded, declined and withdrawn proposals.
- [ ] Notification preferences, retention/deletion controls, audit export and backup/restore procedures.

### 5. Release verification

- [ ] End-to-end acceptance: create opportunity → proposal → approved sources → draft → independent reviews → frozen package → recorded receipt.
- [ ] Permission and organization-isolation tests before enabling multiple organizations.
- [ ] Provider contract and failure-recovery tests; no fabricated AI/provider success responses.
- [ ] Accessibility, mobile layout, performance, operational monitoring and restore drill.

## Verification performed in this assessment

- Existing `npm test`: **21 passed, 0 failed**.
- Read-only PostgreSQL count queries confirmed all twelve displayed totals.
- Reviewed source paths for configuration, record policy, source ingestion,
  AI generation and external connector contract.
- No new feature implementation, production release, full browser acceptance,
  live AI call or external submission is claimed by this document.

The broader repository README contains shared-template material for unrelated
domains. Treat the grant-specific source and verified workflows as the evidence
for this application's capabilities.


## Implementation checkpoint — September 6, 2026

The complete backlog is **not finished**. The following workflows are now implemented in the new `/projects` workspace; the original generic records remain available to original-workspace members.

| Area | Implemented behavior | Limits |
| --- | --- | --- |
| Organizations and access | Organization profiles, current membership checks, owner/manager/editor/reviewer/client roles, explicit project access, one-time named invitations, revocation, member management and session invalidation. | No billing plans, enterprise SSO or production tenancy acceptance yet. Existing records stay in the original workspace; they are not silently converted into proposals. |
| Proposal authoring | Structured sections, word limits, requirements and evidence references, task ownership/deadlines, discussions/mentions, notifications, saved revisions, comparison and rollback with stale-version checks. | Explicit saving; no autosave, rich text tables, templates, deadline email or full opportunity discovery. |
| Source intake | Actual TXT/DOCX/PDF extraction, page/paragraph references, local scanned-page OCR, stored original files and hashes, bounded isolated workers, independent source approval, exact-quote validation. | English OCR needs Poppler/Tesseract. 5 MB/file, 100 PDF pages, 20 OCR pages, 100 sources/project, 50 MB originals and 3 MB extracted evidence/project. Source replacement/version management remains unfinished. |
| Budgets and requirements | Exact integer-based quantities/rates, effort, fringe, indirect costs, cost share and yearly totals; justifications and policy citations; requirements coverage and review gates. | Human eligibility/allowability decisions; no complete funder rules engine or post-award accounting. Supported currencies use two decimal places. |
| Proposal approval | Independent non-contributor reviewers approve the exact evidence snapshot; configurable required count, rejected-review return to draft, active role and project-access checks before freezing. | Human review still must assess factual and policy support. |
| Export and submission | Real DOCX/PDF export, selected approved attachments, immutable ZIP packages with file hashes and manifest; client access to approved packages; manual submission reference and outcome tracking. | No automatic funder-portal submission or externally verified receipt. Receipt-file upload, funder-specific layouts and full accessibility acceptance remain unfinished. |
| Integrity | Database transactions, actor-scoped durable retry receipts, stale-version rejection, immutable frozen files, audit events and tenant/project isolation. | Broader concurrency, deployment and operational acceptance remain required. |

Verification: 21 existing unit tests, 4 PostgreSQL integration scenarios (including real PDF/DOCX extraction, scanned-page OCR, tenant/client boundaries, exact budgets, independent approvals and package hashes), and 46 legacy route checks passed. TypeScript, production build and lint passed; lint retains one pre-existing navigation warning. The generated fixture PDF was rendered and visually inspected. A private PostgreSQL backup was taken before applying the migration; its archive catalog was checked, but a restore drill has not been performed.

No live AI call, provider message, charge, deployment or external grant submission was performed. New organization-scoped AI drafting, discovery feeds, full post-award operations and the rest of the unchecked backlog remain open. A successful local build does not establish production readiness.

Authenticated HTTP smoke also passed for current login, organizations, project listing, original metrics and the new project/organization/notification pages. No password hashes or encrypted secrets appeared in those checked responses.

### Full restore rehearsal — September 6

A fresh private custom-format PostgreSQL backup was restored into a disposable local database. Every public table was read, schema constraints were restored, and the restored database had zero invalid indexes. The disposable database was removed afterward. The backup is retained under `/Users/erolakarsu/.codex/backups/` in this project's directory as `restore-verified-*.dump` with owner-only file permissions. This supersedes the earlier archive-catalog-only checkpoint.

`npm run test:restore` repeats the backup and restore rehearsal against the configured local database. This verifies local restoration; off-site storage, retention scheduling, production disaster recovery and broader release acceptance remain separate work.

### Source-backed AI drafting checkpoint — September 6

- Added project-scoped AI section drafting/rewriting and requirement, budget and proposal review. Editors explicitly select independently approved sources and confirm authorization to share the project/evidence with the configured provider.
- Drafts persist separately from proposal text with evidence snapshots, exact quoted citations, provider receipt/model, reported tokens/cost and review history. Citations must match the selected source chunks and section drafts must fit their word limits. Generated text never edits or approves a proposal automatically.
- Reviewed section application checks the original proposal version, current project/editor access, current source approver access and unchanged source evidence. It saves a new proposal revision through the existing authoring service; independent proposal approval remains required.
- Added durable request identity, organization daily request/reported-cost limits, two concurrent requests, bounded evidence/response sizes, timeouts, cancellation, unknown-outcome holds and explicit rejection. An uncertain request is not automatically submitted again. Review findings remain advisory.
- Validation: 21 unit tests, five isolated PostgreSQL scenarios and 46 legacy route checks passed. New coverage includes actor/project boundaries, quote validation, preserved original text, duplicate generation/application, stale versions, revoked source approval, recorded usage and uncertain-response suppression. TypeScript/build/lint passed (one existing unrelated navigation warning). An isolated production-browser test passed source inspection and reviewed section application with version persistence; anonymous AI reads were denied. No live AI request was made.
- Applied migration `20260906010000_grant_ai_drafts` after backup `/Users/erolakarsu/.codex/backups/grant-workspace/before-ai-drafts-1788722042255.dump`. Restarted the local application.
- Discovery feeds, templates, richer authoring/autosave, source replacement UI, submission-receipt uploads, post-award operations, provider-account acceptance and the broader release checklist remain unfinished.

### Source versions and submission receipt files — September 6

- Source upload now supports replacing the latest source with a new retained version. Replacement is restricted to the current editable project version, has a database-enforced single successor and preserves the original bytes and extracted text. It revokes the old source's current approval, records the previous approval in audit history, increments the proposal revision and requires independent review of the new evidence. Superseded sources cannot be reapproved through the API; old citations must be reviewed before another approved package. Frozen package files/manifests remain unchanged.
- Added private submission-receipt file attachments bound to an existing recorded package. Active project managers must confirm storage/sharing authority and provide context. Supported files are PDF, PNG, JPEG and UTF-8 text, up to 5 MB each, 10 files / 25 MB per package. Exact bytes and SHA-256 hashes are retained; duplicate content is rejected and retry receipts prevent repeated writes. Additional files can document corrections. The database protects receipt history from changes/deletion.
- Staff/reviewer access is required to list or download original receipts. Client access remains limited to shared approved proposal packages. Receipt upload records the manager's evidence; it does not contact or verify a funder portal. Automated retention/deletion and provider submission adapters remain outstanding.

Validation: **21 unit tests, seven PostgreSQL integration scenarios and 46 legacy-route checks passed**. Two new scenarios cover concurrent source replacement, retained bytes and revoked approval, foreign/frozen-project guards, submitted-package binding, manager authority, file validation, duplicate suppression and immutable receipt history. Type checking and production build passed. Lint has zero errors and one existing DomainPage navigation warning. An isolated production browser journey passed source replacement/history, receipt upload/download with exact hash checking and anonymous privacy; screenshots were inspected. No actual funder submission, provider AI request or external message was performed.

The original checklist is still not fully implemented. Major remaining areas include opportunity feeds/saved searches/alerts, reusable approved templates/narratives, richer editing/autosave, further AI and audio workflows, post-award deliverables/spending/reporting, external connectors, retention and broader release acceptance.

Migration `20260906020000_document_versions` was applied after private backup `~/.codex/backups/ai-proposal-grant-development-workspace/before-document-controls-1788725930815.dump`. A fresh full restore rehearsal after this migration passed (38 public tables, 70 constraints, zero invalid indexes; every table readable). The local server restarted and fresh authenticated grant API/page smoke checks passed.

### September 6 — local startup and autofill follow-up

`start.sh` releases existing listeners owned by this project before migrations or builds, including the prior server process tree. It validates all port owners first and preserves unrelated applications. `npm run test:startup` passed for this project; a real repeated HomeServices startup also released both occupied ports and restarted successfully. Local autofill and authenticated browser login were verified across all five apps without changing account passwords. Local `.env` opt-ins and credentials remain untracked.
