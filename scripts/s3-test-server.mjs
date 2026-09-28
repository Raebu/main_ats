import http from "node:http";

const port=Number(process.env.PORT||process.env.S3_TEST_PORT||4566);
const buckets=new Set();
const objects=new Map();

function xmlError(code,message){
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;
}
function send(res,status,body="",headers={}){
  const payload=Buffer.isBuffer(body)?body:Buffer.from(body);
  res.writeHead(status,{"content-length":String(payload.length),...headers});
  res.end(payload);
}
function read(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    req.on("data",chunk=>chunks.push(Buffer.from(chunk)));
    req.on("end",()=>resolve(Buffer.concat(chunks)));
    req.on("error",reject);
  });
}
function parsedPath(req){
  const url=new URL(req.url||"/","http://127.0.0.1");
  const parts=url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  return{url,bucket:parts[0]||"",key:parts.slice(1).join("/")};
}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==="/health"){return send(res,200,JSON.stringify({ok:true,buckets:buckets.size,objects:objects.size}),{"content-type":"application/json"});}
    const{url,bucket,key}=parsedPath(req);
    if(!bucket)return send(res,200,"Raeburn Talent S3 test server");

    if(req.method==="HEAD"&&!key){
      return buckets.has(bucket)?send(res,200):send(res,404,xmlError("NoSuchBucket","Bucket not found"),{"content-type":"application/xml"});
    }
    if(req.method==="PUT"&&!key&&url.searchParams.has("versioning")){
      if(!buckets.has(bucket))return send(res,404,xmlError("NoSuchBucket","Bucket not found"),{"content-type":"application/xml"});
      await read(req);
      return send(res,200);
    }
    if(req.method==="PUT"&&!key){
      await read(req);
      buckets.add(bucket);
      return send(res,200);
    }
    if(!buckets.has(bucket))return send(res,404,xmlError("NoSuchBucket","Bucket not found"),{"content-type":"application/xml"});

    const objectId=bucket+"/"+key;
    if(req.method==="PUT"&&key){
      const body=await read(req);
      objects.set(objectId,{body,contentType:req.headers["content-type"]||"application/octet-stream"});
      return send(res,200,"",{"etag":'"stage10-e2e"'});
    }
    if(req.method==="HEAD"&&key){
      const obj=objects.get(objectId);
      if(!obj)return send(res,404,xmlError("NoSuchKey","Object not found"),{"content-type":"application/xml"});
      return send(res,200,"",{"content-length":String(obj.body.length),"content-type":obj.contentType,"etag":'"stage10-e2e"'});
    }
    if(req.method==="GET"&&key){
      const obj=objects.get(objectId);
      if(!obj)return send(res,404,xmlError("NoSuchKey","Object not found"),{"content-type":"application/xml"});
      return send(res,200,obj.body,{"content-type":obj.contentType,"etag":'"stage10-e2e"'});
    }
    if(req.method==="DELETE"&&key){
      objects.delete(objectId);
      return send(res,204);
    }
    return send(res,405,xmlError("MethodNotAllowed","Unsupported S3 test operation"),{"content-type":"application/xml"});
  }catch(error){
    console.error(error);
    send(res,500,xmlError("InternalError","S3 test server failure"),{"content-type":"application/xml"});
  }
});
server.listen(port,"127.0.0.1",()=>console.log(JSON.stringify({ok:true,service:"stage10-s3-test",port})));
for(const signal of["SIGINT","SIGTERM"])process.on(signal,()=>server.close(()=>process.exit(0)));
