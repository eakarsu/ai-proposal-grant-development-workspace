"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutationFetch } from "@/hooks/use-mutation-fetch";
type Membership = {
  organizationId: string;
  role: string;
  organization: { name: string; timezone: string };
};
type Project = {
  id: string;
  title: string;
  funder: string;
  status: string;
  dueAt: string | null;
  currency: string;
  version: number;
};
export default function ProjectsPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[]>([]),
    [organizationId, setOrganizationId] = useState(""),
    [projects, setProjects] = useState<Project[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const [form, setForm] = useState({
    title: "",
    funder: "",
    program: "",
    dueAt: "",
    currency: "USD",
  });
  const mutate = useMutationFetch();
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/grants/organizations"),
          d = await r.json();
        if (!r.ok) throw Error(d.error);
        setMemberships(d.organizations);
        setOrganizationId(d.organizations[0]?.organizationId ?? "");
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);
  async function load(id = organizationId) {
    if (!id) return;
    try {
      const r = await fetch(
          "/api/grants/projects?organizationId=" + encodeURIComponent(id),
        ),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setProjects(d.projects);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (!organizationId) return;
    let ignore = false;
    void (async () => {
      try {
        const r = await fetch(
            "/api/grants/projects?organizationId=" +
              encodeURIComponent(organizationId),
          ),
          d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!ignore) {
          setProjects(d.projects);
          setError("");
        }
      } catch (e) {
        if (!ignore) setError(String(e));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [organizationId]);
  const role = memberships.find(
      (m) => m.organizationId === organizationId,
    )?.role,
    canCreate = ["OWNER", "MANAGER", "EDITOR"].includes(role ?? "");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await mutate("/api/grants/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          organizationId,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      router.push("/projects/" + d.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const shown = projects.filter((p) =>
    (p.title + " " + p.funder + " " + p.status)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Grant projects</h1>
          <p>Draft, substantiate, review and freeze each proposal.</p>
        </div>
        <Link href="/organizations" className="underline">
          Organizations and reviewers
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <label className="block">
        Organization
        <select
          className="border rounded p-2 ml-3"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
        >
          {memberships.map((m) => (
            <option key={m.organizationId} value={m.organizationId}>
              {m.organization.name} · {m.role}
            </option>
          ))}
        </select>
      </label>
      <div className="grid md:grid-cols-3 gap-4">
        {[
          [
            "Awaiting review",
            projects.filter((p) => p.status === "REVIEW").length,
          ],
          [
            "Upcoming deadlines",
            projects.filter(
              (p) =>
                p.dueAt &&
                new Date(p.dueAt) > new Date() &&
                !["AWARDED", "DECLINED", "WITHDRAWN"].includes(p.status),
            ).length,
          ],
          [
            "Recorded submissions",
            projects.filter((p) =>
              ["SUBMITTED", "AWARDED", "DECLINED"].includes(p.status),
            ).length,
          ],
        ].map(([label, value]) => (
          <div key={label} className="border rounded-lg bg-white p-5">
            <p>{label}</p>
            <strong className="text-3xl">{value}</strong>
          </div>
        ))}
      </div>
      {canCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          className="border rounded-lg p-5 bg-white grid md:grid-cols-2 gap-3"
        >
          <h2 className="md:col-span-2 text-xl font-semibold">New proposal</h2>
          {(["title", "funder", "program", "dueAt", "currency"] as const).map(
            (key) => (
              <label key={key} className="capitalize">
                {key === "dueAt" ? "Deadline (your local timezone)" : key}
                <input
                  className="block border rounded p-2 w-full"
                  required={key === "title" || key === "funder"}
                  type={key === "dueAt" ? "datetime-local" : "text"}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ),
          )}
          <button
            disabled={busy || !organizationId}
            className="bg-slate-900 text-white rounded p-2"
          >
            Create project
          </button>
        </form>
      )}
      <div className="flex gap-3">
        <input
          aria-label="Search projects"
          placeholder="Search by title, funder or status"
          className="border rounded p-2 flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => load()} className="border rounded p-2">
          Refresh
        </button>
      </div>
      <div className="space-y-3">
        {shown.map((p) => (
          <Link
            key={p.id}
            href={"/projects/" + p.id}
            className="block border rounded-lg p-5 bg-white hover:border-blue-400"
          >
            <div className="flex justify-between gap-3">
              <strong>{p.title}</strong>
              <span>{p.status}</span>
            </div>
            <p>
              {p.funder} · Version {p.version}
            </p>
            <p
              className={
                p.dueAt &&
                new Date(p.dueAt) < new Date() &&
                !["SUBMITTED", "AWARDED", "DECLINED", "WITHDRAWN"].includes(
                  p.status,
                )
                  ? "text-red-700"
                  : ""
              }
            >
              Deadline:{" "}
              {p.dueAt ? new Date(p.dueAt).toLocaleString() : "Not configured"}
            </p>
          </Link>
        ))}
        {!shown.length && (
          <p>No projects match this organization and search.</p>
        )}
      </div>
    </div>
  );
}
