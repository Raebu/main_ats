import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(request:Request){
  const form=await request.formData();
  const email=String(form.get("email")||"").toLowerCase();
  const password=String(form.get("password")||"");
  const expectedEmail=(process.env.ADMIN_EMAIL||"careers@theraeburngroup.com").toLowerCase();
  const configured=process.env.ADMIN_PASSWORD||"";
  const valid=configured.startsWith("$2") ? await bcrypt.compare(password,configured) : password===configured;
  if(email!==expectedEmail || !configured || !valid) return NextResponse.redirect(new URL("/login?error=1",request.url),303);
  await createSession(email);
  return NextResponse.redirect(new URL("/admin",request.url),303);
}
