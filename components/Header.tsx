import Link from "next/link";

export default function Header() {
  return <header className="header">
    <div className="shell">
      <Link className="brand" href="/careers">RAEBURN TALENT</Link>
      <nav className="nav">
        <Link href="/careers/jobs">Open roles</Link>
        <Link href="/careers/disability-confident">Disability Confident</Link>
        <Link href="/careers/women">Women</Link>
        <Link href="/careers/forces-veterans">Forces & Veterans</Link>
        <Link href="/admin">ATS</Link>
      </nav>
    </div>
  </header>;
}
