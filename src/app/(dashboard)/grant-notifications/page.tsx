"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Notice = {
  id: string;
  title: string;
  projectId: string | null;
  readAt: string | null;
  createdAt: string;
};
export default function NotificationsPage() {
  const [rows, setRows] = useState<Notice[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/grants/notifications"),
          d = await r.json();
        if (!r.ok) throw Error(d.error);
        setRows(d.notifications);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);
  async function mark(id: string) {
    try {
      const r = await fetch("/api/grants/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw Error("Could not mark notification read");
      setRows(
        rows.map((row) =>
          row.id === id ? { ...row, readAt: new Date().toISOString() } : row,
        ),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Project notifications</h1>
      <p>In-app review, assignment and mention history.</p>
      {error && <p role="alert">{error}</p>}
      {rows.map((row) => (
        <article key={row.id} className="border rounded p-4 bg-white">
          <h2 className={row.readAt ? "" : "font-bold"}>{row.title}</h2>
          <p>{new Date(row.createdAt).toLocaleString()}</p>
          {row.projectId && (
            <Link
              className="underline mr-4"
              href={"/projects/" + row.projectId}
            >
              Open project
            </Link>
          )}
          {!row.readAt && (
            <button className="underline" onClick={() => mark(row.id)}>
              Mark read
            </button>
          )}
        </article>
      ))}
      {!rows.length && <p>No project notifications yet.</p>}
    </div>
  );
}
