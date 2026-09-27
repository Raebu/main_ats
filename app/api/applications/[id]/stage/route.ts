import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

const stage=z.enum(["NEW","SCREENING","REVIEW","SHORTLIST","INTERVIEW","FINAL_INTERVIEW","OFFER","HIRED","REJECTED","WITHDRAWN","ON_HOLD","TALENT_POOL"]);

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireSession();
  const {id}=await params;
  const parsed=stage.safeParse((await request.json()).stage);
  if(!parsed.success) return NextResponse.json({error:"Invalid stage"},{status:400});
  const current=await db.application.findUnique({where:{id}});
  if(!current) return NextResponse.json({error:"Not found"},{status:404});
  const updated=await db.$transaction(async tx=>{
    const result=await tx.application.update({where:{id},data:{stage:parsed.data}});
    await tx.applicationStageHistory.create({data:{applicationId:id,fromStage:current.stage,toStage:parsed.data,changedBy:session.email}});
    await tx.auditLog.create({data:{actor:session.email,action:"application.stage_changed",entityType:"Application",entityId:id,metadata:{from:current.stage,to:parsed.data}}});
    return result;
  });
  return NextResponse.json({ok:true,stage:updated.stage});
}
