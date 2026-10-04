"use client";

import { useEffect, useState } from "react";

type Quote = { version: number; scope: string; feeCents: number; currency: string;
  quoteHash: string; validUntil: string | null; approvedAt?: string | null };
type Preview = { clientName: string; recipientEmail: string; projectTitle: string; quote: Quote;
  invitationExpiresAt: string; notice: string };
type Summary = { client: { legalName: string; billingEmail: string }; quote: Quote;
  acceptance: { name: string; at: string; evidenceHash: string; identityVerification: string };
  approvedProposal: null | { version: number; contentHash: string; title: string; funder: string;
    program: string; sectionTitles: string[]; requestedOutcome: string; requestedAmountCents: number };
  invoiceCandidate: null | { id: string; amountCents: number; currency: string; status: string };
  accessExpiresAt: string; notice: string };
const field = "block w-full rounded border p-2";
const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", {
  style: "currency", currency }).format(cents / 100);

export default function ClientPortalPage() {
  const [inviteToken, setInviteToken] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accessLink, setAccessLink] = useState("");

  async function request(body: object) {
    const response = await fetch("/api/grants/client-portal", { method: "POST",
      headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Portal request failed");
    return data;
  }
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    const savedAccess = window.sessionStorage.getItem("grant-client-portal-access");
    window.history.replaceState(null, "", "/client-portal");
    if (fragment.startsWith("invite=")) setInviteToken(fragment.slice(7));
    else if (fragment.startsWith("access=")) {
      const token = fragment.slice(7);
      window.sessionStorage.setItem("grant-client-portal-access", token);
      setAccessToken(token);
    } else if (savedAccess) setAccessToken(savedAccess);
  }, []);
  useEffect(() => {
    if (!inviteToken) return;
    let ignore = false;
    void request({ action: "PREVIEW", token: inviteToken }).then(data => {
      if (!ignore) { setPreview(data); setEmail(data.recipientEmail); }
    }).catch(e => { if (!ignore) setError(String(e)); });
    return () => { ignore = true; };
  }, [inviteToken]);
  useEffect(() => {
    if (!accessToken) return;
    let ignore = false;
    void request({ action: "VIEW", accessToken }).then(data => {
      if (!ignore) setSummary(data);
    }).catch(e => { if (!ignore) { setError(String(e)); setAccessToken("");
      window.sessionStorage.removeItem("grant-client-portal-access"); } });
    return () => { ignore = true; };
  }, [accessToken]);
  async function accept() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const data = await request({ action: "ACCEPT", token: inviteToken, fullName, email,
        quoteHash: preview.quote.quoteHash, accepted });
      const token = String(data.accessToken);
      setAccessLink(`${window.location.origin}/client-portal#access=${token}`);
      window.sessionStorage.setItem("grant-client-portal-access", token);
      setInviteToken(""); setPreview(null); setAccessToken(token);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl p-6 md:p-10 space-y-5">
    <header className="space-y-2"><h1 className="text-2xl font-bold">Client engagement portal</h1>
      <p>Review an approved engagement quote, record your named acceptance, and view the read-only engagement summary.</p></header>
    {error && <p role="alert" className="rounded border border-red-300 p-3 text-red-800">{error}</p>}
    {preview && <section className="rounded border bg-white p-5 space-y-4">
      <h2 className="text-xl font-semibold">Invitation for {preview.clientName}</h2>
      <p>Project: {preview.projectTitle} · Invitation expires {new Date(preview.invitationExpiresAt).toLocaleString()}</p>
      <p>Quote v{preview.quote.version} · <strong>{money(preview.quote.feeCents, preview.quote.currency)}</strong>
        {preview.quote.validUntil ? ` · quote valid until ${new Date(preview.quote.validUntil).toLocaleDateString()}` : ""}</p>
      <p className="whitespace-pre-wrap rounded border p-3">{preview.quote.scope}</p>
      <p className="break-all text-xs">Quote SHA-256 {preview.quote.quoteHash}</p>
      <p className="text-sm text-amber-800">{preview.notice}</p>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void accept(); }}>
        <label className="block">Your full name<input className={field} autoComplete="name" required minLength={2}
          maxLength={150} value={fullName} onChange={event => setFullName(event.target.value)}/></label>
        <label className="block">Invited billing email<input className={field} type="email" required
          value={email} onChange={event => setEmail(event.target.value)}/></label>
        <label className="flex items-start gap-2"><input type="checkbox" required checked={accepted}
          onChange={event => setAccepted(event.target.checked)}/>
          <span>I accept the quoted scope and {money(preview.quote.feeCents, preview.quote.currency)} fixed fee shown above for quote v{preview.quote.version}.</span></label>
        <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={busy || !accepted}>Accept quote and open read-only portal</button>
      </form>
    </section>}
    {summary && <div className="space-y-4">
      {accessLink && <section className="rounded border border-amber-300 p-4 space-y-2">
        <h2 className="font-semibold">Save your private access link</h2>
        <p>The access link is issued once, expires {new Date(summary.accessExpiresAt).toLocaleString()}, and can be revoked by the organization. Keep it private.</p>
        <input className={field} readOnly value={accessLink} aria-label="Private client portal access link"/>
        <button className="rounded border px-3 py-2" onClick={() => void navigator.clipboard.writeText(accessLink)}>Copy access link</button>
      </section>}
      <section className="rounded border bg-white p-5 space-y-3"><h2 className="text-xl font-semibold">{summary.client.legalName}</h2>
        <p>Named acceptance: {summary.acceptance.name} · {new Date(summary.acceptance.at).toLocaleString()}</p>
        <p className="text-sm text-amber-800">Identity: self-attested billing email; email ownership was not independently verified.</p>
        <p className="break-all text-xs">Acceptance evidence SHA-256 {summary.acceptance.evidenceHash}</p>
        <h3 className="font-semibold">Approved engagement quote v{summary.quote.version}</h3>
        <p><strong>{money(summary.quote.feeCents, summary.quote.currency)}</strong></p>
        <p className="whitespace-pre-wrap">{summary.quote.scope}</p>
        <p className="break-all text-xs">Quote SHA-256 {summary.quote.quoteHash}</p>
      </section>
      <section className="rounded border bg-white p-5 space-y-3"><h2 className="text-xl font-semibold">Proposal and billing summary</h2>
        {summary.approvedProposal ? <><p>{summary.approvedProposal.title} · {summary.approvedProposal.funder} · {summary.approvedProposal.program}</p>
          <p>Approved proposal version {summary.approvedProposal.version} · requested amount {money(summary.approvedProposal.requestedAmountCents, summary.quote.currency)}</p>
          {summary.approvedProposal.requestedOutcome && <p className="whitespace-pre-wrap">Requested outcome: {summary.approvedProposal.requestedOutcome}</p>}
          <p>Sections: {summary.approvedProposal.sectionTitles.join(", ") || "None"}</p>
          <p className="break-all text-xs">Proposal SHA-256 {summary.approvedProposal.contentHash}</p></>
          : <p>There is no current approved proposal summary to display.</p>}
        {summary.invoiceCandidate ? <p>Internal invoice candidate: {money(summary.invoiceCandidate.amountCents, summary.invoiceCandidate.currency)} · {summary.invoiceCandidate.status}. Delivery and payment are not verified.</p>
          : <p>No invoice candidate has been prepared for this quote.</p>}
        <p className="text-sm text-amber-800">{summary.notice}</p>
      </section>
    </div>}
    {!preview && !summary && !error && <p>Open the private invitation or access link supplied by the organization.</p>}
  </main>;
}
