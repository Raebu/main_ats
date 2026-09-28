import{S3Client,HeadBucketCommand,CreateBucketCommand,PutBucketVersioningCommand}from"@aws-sdk/client-s3";

const endpoint=process.env.R2_ENDPOINT||process.env.OBJECT_STORAGE_ENDPOINT||"http://127.0.0.1:9000";
const bucket=process.env.R2_BUCKET||"raeburn-talent";
const client=new S3Client({
  region:process.env.R2_REGION||"us-east-1",
  endpoint,
  forcePathStyle:process.env.R2_FORCE_PATH_STYLE!=="false",
  credentials:{
    accessKeyId:process.env.R2_ACCESS_KEY_ID||"minioadmin",
    secretAccessKey:process.env.R2_SECRET_ACCESS_KEY||"minioadmin"
  }
});
let ready=false,lastError;
for(let attempt=0;attempt<60;attempt++){
  try{
    try{await client.send(new HeadBucketCommand({Bucket:bucket}));}
    catch(error){
      const status=error?.$metadata?.httpStatusCode;
      if(status===404||error?.name==="NotFound"||error?.name==="NoSuchBucket"){
        await client.send(new CreateBucketCommand({Bucket:bucket}));
      }else throw error;
    }
    await client.send(new PutBucketVersioningCommand({Bucket:bucket,VersioningConfiguration:{Status:"Enabled"}}));
    ready=true;break;
  }catch(error){lastError=error;await new Promise(resolve=>setTimeout(resolve,1000));}
}
if(!ready)throw new Error("Object storage did not become ready at "+endpoint,{cause:lastError});
console.log(JSON.stringify({ok:true,endpoint,bucket,versioning:"Enabled"}));
