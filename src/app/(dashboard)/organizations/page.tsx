"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutationFetch } from "@/hooks/use-mutation-fetch";
type Organization = {
  id: string;
  name: string;
  profile: string;
  timezone: string;
  reviewCount: number;
  version: number;
};
type Member = {
  userId: string;
  role: string;
  active: boolean;
  projectIds: string[];
  user: { name: string; email: string };
};
type Invite = {
  id: string;
  email: string;
  role: string;
  projectId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
export default function OrganizationsPage() {
  const { data: session } = useSession(),
    mutate = useMutationFetch();
  const [organizations, setOrganizations] = useState<
      { organization: Organization; organizationId: string; role: string }[]
    >([]),
    [selected, setSelected] = useState(""),
    [form, setForm] = useState<Organization | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [projects, setProjects] = useState<{ id: string; title: string }[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [createName, setCreateName] = useState(""),
    [invitation, setInvitation] = useState({
      email: "",
      role: "REVIEWER",
      projectId: "",
    });
  const load = useCallback(async () => {
    const r = await fetch("/api/grants/organizations"),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    return d.organizations as typeof organizations;
  }, []);
  useEffect(() => {
    void load()
      .then((rows) => {
        setOrganizations(rows);
        setSelected(rows[0]?.organizationId ?? "");
      })
      .catch((e) => setError(String(e)));
  }, [load]);
  useEffect(() => {
    if (!selected) return;
    let ignore = false;
    void (async () => {
      try {
        const rows = await load(),
          record = rows.find((o) => o.organizationId === selected);
        if (ignore) return;
        setOrganizations(rows);
        setForm(record?.organization ?? null);
        if (record && ["OWNER", "MANAGER"].includes(record.role)) {
          const [a, b] = await Promise.all([
            fetch(
              "/api/grants/team?organizationId=" + encodeURIComponent(selected),
            ),
            fetch(
              "/api/grants/projects?organizationId=" +
                encodeURIComponent(selected),
            ),
          ]);
          const [team, projectData] = await Promise.all([a.json(), b.json()]);
          if (!a.ok || !b.ok) throw Error(team.error || projectData.error);
          if (!ignore) {
            setMembers(team.members);
            setInvites(team.invitations);
            setProjects(projectData.projects);
          }
        } else {
          setMembers([]);
          setInvites([]);
        }
      } catch (e) {
        if (!ignore) setError(String(e));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [selected, load]);
  const role = organizations.find((o) => o.organizationId === selected)?.role;
  async function send(url: string, method: string, payload: object) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await mutate(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.invitationPath)
        setMessage(
          "Invitation link (share privately): " +
            window.location.origin +
            d.invitationPath,
        );
      else setMessage(d.message ?? "Saved");
      setOrganizations(await load());
      return d;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-3xl font-bold">Organizations and access</h1>
      <Link href="/projects" className="underline">
        Grant projects
      </Link>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="break-all border rounded p-3">
          {message}
        </p>
      )}
      <label className="block">
        Organization
        <select
          className="border rounded p-2 ml-3"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {organizations.map((o) => (
            <option key={o.organizationId} value={o.organizationId}>
              {o.organization.name} · {o.role}
            </option>
          ))}
        </select>
      </label>
      {session?.user.role === "ADMIN" && (
        <form
          className="border rounded p-5 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send("/api/grants/organizations", "POST", {
              name: createName,
              timezone: "America/New_York",
            }).then((d) => {
              if (d) setSelected(d.id);
            });
          }}
        >
          <label>
            New organization
            <input
              required
              className="block border rounded p-2"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </label>
          <button disabled={busy} className="border rounded p-2">
            Create organization
          </button>
        </form>
      )}
      {form && role === "OWNER" && (
        <form
          className="border rounded p-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send("/api/grants/organizations", "PUT", {
              organizationId: selected,
              expectedVersion: form.version,
              name: form.name,
              profile: form.profile,
              timezone: form.timezone,
              reviewCount: form.reviewCount,
            }).then((d) => {
              if (d) setForm(d);
            });
          }}
        >
          <h2 className="text-xl font-semibold">
            Organization profile and approval policy
          </h2>
          {(["name", "timezone"] as const).map((k) => (
            <label key={k} className="block capitalize">
              {k}
              <input
                required
                className="border rounded p-2 block w-full"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="block">
            Organization narrative
            <textarea
              className="border rounded p-2 w-full"
              rows={5}
              value={form.profile}
              onChange={(e) => setForm({ ...form, profile: e.target.value })}
            />
          </label>
          <label className="block">
            Independent approvals required
            <input
              type="number"
              min={1}
              max={5}
              className="border rounded p-2 ml-3"
              value={form.reviewCount}
              onChange={(e) =>
                setForm({ ...form, reviewCount: Number(e.target.value) })
              }
            />
          </label>
          <button
            disabled={busy}
            className="bg-slate-900 text-white rounded p-2"
          >
            Save policy
          </button>
        </form>
      )}
      {["OWNER", "MANAGER"].includes(role ?? "") && (
        <>
          <form
            className="border rounded p-5 grid md:grid-cols-3 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send("/api/grants/invitations", "POST", {
                organizationId: selected,
                ...invitation,
                projectId: invitation.projectId || null,
              });
            }}
          >
            <h2 className="text-xl font-semibold md:col-span-3">
              Invite a teammate, reviewer or client
            </h2>
            <label>
              Email
              <input
                required
                type="email"
                className="block border rounded p-2 w-full"
                value={invitation.email}
                onChange={(e) =>
                  setInvitation({ ...invitation, email: e.target.value })
                }
              />
            </label>
            <label>
              Role
              <select
                className="block border rounded p-2"
                value={invitation.role}
                onChange={(e) =>
                  setInvitation({ ...invitation, role: e.target.value })
                }
              >
                {["MANAGER", "EDITOR", "REVIEWER", "CLIENT"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Project
              <select
                className="block border rounded p-2"
                value={invitation.projectId}
                onChange={(e) =>
                  setInvitation({ ...invitation, projectId: e.target.value })
                }
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <p className="md:col-span-3">
              Clients can download frozen approved packages. Reviewers see only
              assigned projects. Invitation links expire after seven days; this
              screen does not send email.
            </p>
            <button
              disabled={busy}
              className="bg-slate-900 text-white rounded p-2"
            >
              Create private invitation link
            </button>
          </form>
          <section className="border rounded p-5 space-y-3">
            <h2 className="text-xl font-semibold">Members</h2>
            {members.map((m) => (
              <div key={m.userId} className="border rounded p-3">
                <p>
                  {m.user?.name} · {m.user?.email} · {m.role} ·{" "}
                  {m.active ? "Active" : "Inactive"}
                </p>
                {role === "OWNER" && (
                  <>
                    <select
                      aria-label={`Role for ${m.user?.name}`}
                      value={m.role}
                      onChange={(e) =>
                        setMembers(
                          members.map((row) =>
                            row.userId === m.userId
                              ? { ...row, role: e.target.value }
                              : row,
                          ),
                        )
                      }
                      className="border rounded p-2"
                    >
                      {["OWNER", "MANAGER", "EDITOR", "REVIEWER", "CLIENT"].map(
                        (r) => (
                          <option key={r}>{r}</option>
                        ),
                      )}
                    </select>
                    <label className="ml-3">
                      <input
                        type="checkbox"
                        checked={m.active}
                        onChange={(e) =>
                          setMembers(
                            members.map((row) =>
                              row.userId === m.userId
                                ? { ...row, active: e.target.checked }
                                : row,
                            ),
                          )
                        }
                      />{" "}
                      Active
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {projects.map((p) => (
                        <label key={p.id}>
                          <input
                            type="checkbox"
                            checked={m.projectIds.includes(p.id)}
                            onChange={(e) =>
                              setMembers(
                                members.map((row) =>
                                  row.userId === m.userId
                                    ? {
                                        ...row,
                                        projectIds: e.target.checked
                                          ? [...row.projectIds, p.id]
                                          : row.projectIds.filter(
                                              (id) => id !== p.id,
                                            ),
                                      }
                                    : row,
                                ),
                              )
                            }
                          />{" "}
                          {p.title}
                        </label>
                      ))}
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        send("/api/grants/organizations", "PATCH", {
                          organizationId: selected,
                          userId: m.userId,
                          role: m.role,
                          active: m.active,
                          projectIds: m.projectIds,
                        })
                      }
                      className="border rounded p-2"
                    >
                      Save member access
                    </button>
                  </>
                )}
              </div>
            ))}
          </section>
          <section className="border rounded p-5 space-y-3">
            <h2 className="text-xl font-semibold">Invitations</h2>
            {invites.map((i) => (
              <p key={i.id}>
                {i.email} · {i.role} ·{" "}
                {i.acceptedAt
                  ? "Accepted"
                  : i.revokedAt
                    ? "Revoked"
                    : "Expires " + new Date(i.expiresAt).toLocaleString()}{" "}
                {!i.acceptedAt && !i.revokedAt && (
                  <button
                    className="underline"
                    onClick={() =>
                      send("/api/grants/invitations", "DELETE", {
                        organizationId: selected,
                        invitationId: i.id,
                      }).then((d) => {
                        if (d)
                          setInvites(
                            invites.map((row) =>
                              row.id === i.id
                                ? {
                                    ...row,
                                    revokedAt: new Date().toISOString(),
                                  }
                                : row,
                            ),
                          );
                      })
                    }
                  >
                    Revoke
                  </button>
                )}
              </p>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
