import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string}>}){
  if(await getSession()) redirect("/admin");
  const q=await searchParams;
  return <section className="section"><div className="shell" style={{maxWidth:520}}>
    <div className="card">
      <h1>Raeburn Talent ATS</h1>
      <p className="muted">Internal recruitment access.</p>
      {q.error && <div className="notice">Invalid credentials.</div>}
      <form className="form" action="/api/auth/login" method="post">
        <div className="field"><label>Email</label><input name="email" type="email" required /></div>
        <div className="field"><label>Password</label><input name="password" type="password" required /></div>
        <button className="button" type="submit">Sign in</button>
      </form>
    </div>
  </div></section>;
}
