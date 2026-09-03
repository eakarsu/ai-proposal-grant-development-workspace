# Operations

## Local development

```bash
./start.sh
```

`start.sh` loads `.env`, applies pending Prisma migrations, and starts the
Next.js dev server on port `4629`.

## Database

- Migrations: `npm run db:migrate` (dev) / `npm run db:deploy` (prod)
- Seed demo data: `npm run db:seed`
- Reset: destructive — `npx prisma migrate reset`

## Environment

See `.env.example`. Required: `DATABASE_URL`, `NEXTAUTH_SECRET`. Optional:
`OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`).

## Backups

Use managed Postgres backups or `pg_dump`. Audit rows are append-only; do not
re-point the database without exporting `AuditLog`.

## Security notes

- Never commit `.env`. Rotate `NEXTAUTH_SECRET` on any credential incident.
- AI endpoints are rate-conscious and server-side only.
