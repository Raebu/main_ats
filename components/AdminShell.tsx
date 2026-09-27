import Link from "next/link";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="admin">
    <aside className="sidebar">
      <strong>RAEBURN TALENT</strong>
      <nav style={{marginTop:24}}>
        <Link href="/admin">Dashboard</Link>
        <Link href="/admin/jobs">Jobs</Link>
        <Link href="/admin/applications">Applications</Link>
        <Link href="/admin/candidates">Candidates</Link>
        <Link href="/api/feeds/jobs.json">JSON feed</Link>
        <Link href="/api/feeds/jobs.xml">XML feed</Link>
        <form action="/api/auth/logout" method="post"><button className="button secondary" type="submit">Sign out</button></form>
      </nav>
    </aside>
    <main className="content">{children}</main>
  </div>;
}
