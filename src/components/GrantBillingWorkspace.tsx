"use client";

import { useEffect, useState } from "react";
import { useMutationFetch } from "@/hooks/use-mutation-fetch";

type Client = { id: string; legalName: string; billingEmail: string; billingAddress: string; contactName: string };
type Quote = { id: string; clientId: string; version: number; scope: string; feeCents: number; currency: string;
  validUntil: string | null; quoteHash: string; status: string; createdById: string; approvedById: string | null;
  approvalRationale: string | null };
type Evidence = { id: string; eventType: string; externalReference: string; evidenceText: string;
  evidenceHash: string; verificationStatus: string; recordedAt: string };
type Invoice = { id: string; clientId: string; quoteId: string; amountCents: number; currency: string;
  quoteHash: string; status: string; createdAt: string; voidReason: string | null; evidence: Evidence[] };
type PortalEvent = { id: string; eventType: string; actorId: string | null; clientName: string | null;
  clientEmail: string | null; statement: string; evidenceHash: string; createdAt: string };
type PortalInvitation = { id: string; clientId: string; quoteId: string; recipientEmail: string; quoteHash: string;
  expiresAt: string; acceptedAt: string | null; accessExpiresAt: string | null;
  revokedAt: string | null; createdAt: string; events: PortalEvent[] };
type BillingView = { actorId: string; role: string; project: { currency: string }; clients: Client[];
  quotes: Quote[]; invoices: Invoice[]; portalInvitations: PortalInvitation[]; scope: string };
const field = "block w-full rounded border p-2";
const button = "rounded border px-3 py-2 disabled:opacity-50";
const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export default function GrantBillingWorkspace({ projectId }: { projectId: string }) {
  const base = `/api/grants/projects/${encodeURIComponent(projectId)}/billing`;
  const mutate = useMutationFetch();
  const [view, setView] = useState<BillingView | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [client, setClient] = useState({ legalName: "", billingEmail: "", billingAddress: "", contactName: "" });
  const [quote, setQuote] = useState({ clientId: "", scope: "", feeAmount: "", validUntil: "" });
  const [reviewReason, setReviewReason] = useState("");
  const [status, setStatus] = useState({ invoiceId: "", eventType: "INVOICE_SENT_REPORTED", externalReference: "", evidenceText: "" });
  const [invitationLink, setInvitationLink] = useState("");

  async function load() {
    const response = await fetch(base);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Could not load billing records");
    setView(data);
  }
  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const response = await fetch(base);
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Could not load billing records");
        if (!ignore) setView(data);
      } catch (e) { if (!ignore) setError(String(e)); }
    })();
    return () => { ignore = true; };
  }, [base]);
  async function act(payload: object, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await mutate(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Billing action failed");
      setMessage(success); await load();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  async function invite(quoteId: string) {
    setBusy(true); setError(""); setMessage(""); setInvitationLink("");
    try {
      const response = await mutate(`/api/grants/projects/${encodeURIComponent(projectId)}/client-portal`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not create invitation");
      if (data.invitationPath) setInvitationLink(`${window.location.origin}${data.invitationPath}`);
      setMessage(data.message); await load();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  async function revoke(invitationId: string) {
    const reason = window.prompt("Reason to revoke this client portal invitation or access link");
    if (!reason) return;
    setBusy(true); setError(""); setMessage(""); setInvitationLink("");
    try {
      const response = await mutate(`/api/grants/projects/${encodeURIComponent(projectId)}/client-portal`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId, reason }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not revoke portal access");
      setMessage("Client portal invitation and access revoked"); await load();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  if (!view) return <p role={error ? "alert" : undefined}>{error || "Loading client and billing records…"}</p>;
  const manager = ["OWNER", "MANAGER"].includes(view.role);
  const clientName = (id: string) => view.clients.find(c => c.id === id)?.legalName || id;
  return <div className="space-y-5">
    <header className="rounded border bg-white p-5 space-y-2">
      <h2 className="text-xl font-semibold">Client onboarding and engagement billing</h2>
      <p>Record a billing profile, quote the proposal engagement scope and fixed fee, obtain independent approval, invite the named billing contact to accept, then prepare an internal invoice candidate. Client identity, invoice delivery and payment are not independently verified by this workspace.</p>
      <p className="text-sm text-amber-800">{view.scope}</p>
    </header>
    {error && <p role="alert" className="rounded border border-red-300 p-3 text-red-800">{error}</p>}
    {message && <p role="status" className="rounded border p-3">{message}</p>}
    <section className="rounded border bg-white p-5 space-y-3">
      <h3 className="font-semibold">1. Billing client profile</h3>
      <p className="text-sm">This stores staff-entered billing details. Grant project access and invitations are managed separately.</p>
      {manager && <form className="grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); void act({ action: "CREATE_CLIENT", ...client }, "Client billing profile recorded"); }}>
        <label>Legal name<input className={field} required minLength={2} maxLength={200} value={client.legalName} onChange={e => setClient({ ...client, legalName: e.target.value })}/></label>
        <label>Billing email<input className={field} type="email" required value={client.billingEmail} onChange={e => setClient({ ...client, billingEmail: e.target.value })}/></label>
        <label>Contact name<input className={field} required minLength={2} value={client.contactName} onChange={e => setClient({ ...client, contactName: e.target.value })}/></label>
        <label>Billing address<textarea className={field} required minLength={10} value={client.billingAddress} onChange={e => setClient({ ...client, billingAddress: e.target.value })}/></label>
        <button className={button + " md:col-span-2"} disabled={busy}>Record billing client</button>
      </form>}
      {view.clients.length ? <ul className="space-y-1 text-sm">{view.clients.map(c => <li key={c.id}><strong>{c.legalName}</strong> · {c.billingEmail} · {c.contactName}</li>)}</ul> : <p>No billing client recorded for this organization.</p>}
    </section>
    <section className="rounded border bg-white p-5 space-y-3">
      <h3 className="font-semibold">2. Quoted engagement scope and fee</h3>
      <p className="text-sm">The quote version and SHA-256 fingerprint bind the scope, fixed price, client, project and expiry. A different manager must approve it. Approval is internal and does not establish client acceptance.</p>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void act({ action: "DRAFT_QUOTE", ...quote, validUntil: quote.validUntil || null }, "Engagement quote drafted"); }}>
        <label>Billing client<select className={field} required value={quote.clientId} onChange={e => setQuote({ ...quote, clientId: e.target.value })}><option value="">Choose a client</option>{view.clients.map(c => <option key={c.id} value={c.id}>{c.legalName}</option>)}</select></label>
        <label>Scope and deliverables<textarea className={field} required minLength={20} maxLength={5000} rows={4} value={quote.scope} onChange={e => setQuote({ ...quote, scope: e.target.value })}/></label>
        <div className="grid gap-3 md:grid-cols-2"><label>Fixed fee ({view.project.currency})<input className={field} required inputMode="decimal" placeholder="2500.00" value={quote.feeAmount} onChange={e => setQuote({ ...quote, feeAmount: e.target.value })}/></label>
          <label>Quote expiry (optional)<input className={field} type="date" value={quote.validUntil} onChange={e => setQuote({ ...quote, validUntil: e.target.value })}/></label></div>
        <button className={button} disabled={busy || !view.clients.length}>Draft quote</button>
      </form>
      <div className="space-y-3">{view.quotes.map(q => <article key={q.id} className="rounded border p-3 space-y-2">
        <p><strong>{clientName(q.clientId)} · quote v{q.version}</strong> · {q.status} · {money(q.feeCents, q.currency)}{q.validUntil ? ` · expires ${q.validUntil.slice(0, 10)}` : ""}</p>
        <p className="whitespace-pre-wrap text-sm">{q.scope}</p><p className="break-all text-xs">SHA-256 {q.quoteHash}</p>
        {q.approvalRationale && <p className="text-sm">Independent review: {q.approvalRationale}</p>}
        {q.status === "DRAFT" && manager && q.createdById !== view.actorId && <div className="space-y-2"><label>Independent billing review rationale<textarea className={field} minLength={20} maxLength={2000} value={reviewReason} onChange={e => setReviewReason(e.target.value)}/></label><button className={button} disabled={busy || reviewReason.trim().length < 20} onClick={() => void act({ action: "APPROVE_QUOTE", quoteId: q.id, quoteHash: q.quoteHash, rationale: reviewReason }, "Quote independently approved")}>Approve quote</button></div>}
        {q.status === "APPROVED" && manager && (view.invoices.some(i => i.clientId === q.clientId && i.status === "CANDIDATE")
          ? <p className="text-sm text-amber-800">This client engagement already has an active invoice candidate. Review its evidence before billing a revised quote.</p>
          : <button className={button} disabled={busy} onClick={() => void act({ action: "CREATE_INVOICE_CANDIDATE", quoteId: q.id }, "Internal invoice candidate prepared")}>Prepare invoice candidate</button>)}
      </article>)}</div>
    </section>
    <section className="rounded border bg-white p-5 space-y-3">
      <h3 className="font-semibold">3. Client portal invitations and acceptance</h3>
      <p className="text-sm">An approved quote can be shared through a seven-day, single-use private link. Copy it manually; no email is sent. The recipient enters their name and billing email and accepts the exact quote. The later read-only access link expires after 30 days and can be revoked. Email ownership is self-attested.</p>
      {manager && view.quotes.filter(q => q.status === "APPROVED").map(q => <div key={q.id} className="rounded border p-3 flex flex-wrap items-center gap-3">
        <span>{clientName(q.clientId)} · quote v{q.version} · {money(q.feeCents, q.currency)}</span>
        <button className={button} disabled={busy || view.portalInvitations.some(i => i.clientId === q.clientId && !i.revokedAt &&
          ((!i.acceptedAt && new Date(i.expiresAt) > new Date()) || (i.acceptedAt && i.accessExpiresAt && new Date(i.accessExpiresAt) > new Date())))}
          onClick={() => void invite(q.id)}>Create one-use invitation</button>
      </div>)}
      {invitationLink && <div className="rounded border border-amber-300 p-3 space-y-2"><p className="font-medium">Copy this private link now. It will not be shown again.</p>
        <input className={field} readOnly aria-label="One-time client portal invitation link" value={invitationLink}/>
        <button className={button} onClick={() => void navigator.clipboard.writeText(invitationLink)}>Copy invitation link</button></div>}
      {view.portalInvitations.length ? view.portalInvitations.map(i => {
        const state = i.revokedAt ? "REVOKED" : i.acceptedAt ? (i.accessExpiresAt && new Date(i.accessExpiresAt) > new Date() ? "ACCEPTED · ACTIVE" : "ACCEPTED · ACCESS EXPIRED") : new Date(i.expiresAt) > new Date() ? "PENDING" : "EXPIRED";
        return <article key={i.id} className="rounded border p-3 space-y-2 text-sm">
          <p><strong>{clientName(i.clientId)}</strong> · {state} · {i.recipientEmail} · quote v{view.quotes.find(q => q.id === i.quoteId)?.version ?? "?"}</p>
          <p>Invitation expiry: {new Date(i.expiresAt).toLocaleString()}{i.accessExpiresAt ? ` · Access expiry: ${new Date(i.accessExpiresAt).toLocaleString()}` : ""}</p>
          {i.events.map(event => <details key={event.id} className="rounded border p-2"><summary>{event.eventType} · {new Date(event.createdAt).toLocaleString()}{event.clientName ? ` · ${event.clientName}` : ""}</summary>
            <p className="whitespace-pre-wrap">{event.statement}</p><p className="break-all text-xs">Evidence SHA-256 {event.evidenceHash}</p></details>)}
          {manager && !i.revokedAt && <button className={button} disabled={busy} onClick={() => void revoke(i.id)}>Revoke invitation and access</button>}
        </article>;
      }) : <p className="text-sm">No client portal invitations yet.</p>}
    </section>
    <section className="rounded border bg-white p-5 space-y-3">
      <h3 className="font-semibold">4. Invoice candidates and reported payment status</h3>
      <p className="text-sm">A candidate is not an issued invoice. Staff may append copied portal or correspondence evidence, labeled unverified. A payment-received report does not prove settlement; an actual provider receipt and reconciliation remain external gates.</p>
      {view.invoices.length ? view.invoices.map(invoice => <article key={invoice.id} className="rounded border p-3 space-y-2">
        <p><strong>{clientName(invoice.clientId)}</strong> · quote v{view.quotes.find(q => q.id === invoice.quoteId)?.version ?? "?"} · {money(invoice.amountCents, invoice.currency)} · {invoice.status}</p>
        <p className="break-all text-xs">Quote fingerprint {invoice.quoteHash}</p>
        {invoice.voidReason && <p className="text-sm">Void reason: {invoice.voidReason}</p>}
        {invoice.evidence.map(e => <details key={e.id} className="rounded border p-2"><summary>{e.eventType.replaceAll("_", " ")} · {e.externalReference} · <strong>{e.verificationStatus}</strong></summary><p className="whitespace-pre-wrap text-sm">{e.evidenceText}</p><p className="break-all text-xs">Evidence SHA-256 {e.evidenceHash}</p></details>)}
        {manager && invoice.status === "CANDIDATE" && !invoice.evidence.length && <button className={button} disabled={busy} onClick={() => { const reason = window.prompt("Reason to void this internal invoice candidate"); if (reason) void act({ action: "VOID_INVOICE_CANDIDATE", invoiceId: invoice.id, reason }, "Invoice candidate voided"); }}>Void candidate</button>}
      </article>) : <p>No invoice candidates yet.</p>}
      {manager && view.invoices.some(i => i.status === "CANDIDATE" && !i.evidence.some(e => e.eventType === "PAYMENT_RECEIVED_REPORTED")) && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void act({ action: "RECORD_PAYMENT_STATUS", ...status }, "Operator-reported status retained as unverified evidence"); }}>
        <h4 className="font-semibold">Append unverified status evidence</h4>
        <div className="grid gap-3 md:grid-cols-2"><label>Invoice candidate<select className={field} required value={status.invoiceId} onChange={e => setStatus({ ...status, invoiceId: e.target.value })}><option value="">Choose candidate</option>{view.invoices.filter(i => i.status === "CANDIDATE" && !i.evidence.some(e => e.eventType === "PAYMENT_RECEIVED_REPORTED")).map(i => <option key={i.id} value={i.id}>{clientName(i.clientId)} · {money(i.amountCents, i.currency)}</option>)}</select></label>
          <label>Reported status<select className={field} value={status.eventType} onChange={e => setStatus({ ...status, eventType: e.target.value })}><option value="INVOICE_SENT_REPORTED">Invoice sent, reported</option><option value="PAYMENT_PENDING_REPORTED">Payment pending, reported</option><option value="PAYMENT_RECEIVED_REPORTED">Payment received, reported</option></select></label></div>
        <label>External reference<input className={field} required minLength={5} maxLength={200} value={status.externalReference} onChange={e => setStatus({ ...status, externalReference: e.target.value })}/></label>
        <label>Copied portal or correspondence evidence<textarea className={field} required minLength={20} maxLength={10000} rows={3} value={status.evidenceText} onChange={e => setStatus({ ...status, evidenceText: e.target.value })}/></label>
        <button className={button} disabled={busy || !status.invoiceId}>Record unverified status</button>
      </form>}
    </section>
  </div>;
}
