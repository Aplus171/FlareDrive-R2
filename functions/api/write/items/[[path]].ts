import { notFound, parseBucketPath } from "@/utils/bucket";
import { get_auth_status } from "@/utils/auth";
import { OneDriveClient, isOneDrivePath } from "@/utils/onedrive";
 
export async function onRequestPutMultipart(context) {
  // 原有分段上传代码不变
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();
 
  const request = context.request;
  const url = new URL(request.url);
 
  const uploadId = new URLSearchParams(url.search).get("uploadId");
  const multipartUpload = await bucket.resumeMultipartUpload(path, uploadId);
 
  const partNumber = parseInt(
    new URLSearchParams(url.search).get("partNumber")
  );
  const uploadedPart = await multipartUpload.uploadPart(
    partNumber,
    request.body
  );
 
  return new Response(null, {
    headers: {
      "Content-Type": "application/json",
      etag: uploadedPart.etag,
    },
  });
}
 
export async function onRequestPut(context) {
  if(!get_auth_status(context)) {
    var header = new Headers()
    header.set("WWW-Authenticate",'Basic realm="需要登录"')
    return new Response("没有操作权限", {
        status: 401,
        headers: header,
    });
  }
  
  const url = new URL(context.request.url);
  const [bucket, path] = parseBucketPath(context);
  
  // 处理分段上传请求
  if (new URLSearchParams(url.search).has("uploadId")) {
    return onRequestPutMultipart(context);
  }
  
  // 检查是否是OneDrive路径
  if (isOneDrivePath(path)) {
    try {
      // 使用OneDrive客户端上传
      const oneDriveClient = new OneDriveClient(context.env);
      const request = context.request;
      const content = request.body;
      
      const result = await oneDriveClient.uploadFile(path, content, {
        contentType: request.headers.get("content-type")
      });
      
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(error.toString(), { status: 500 });
    }
  } else {
    // 原有R2存储逻辑
    if (!bucket) return notFound();
    
    const request = context.request;
    let content = request.body;
    const customMetadata = {};
    
    if (request.headers.has("x-amz-copy-source")) {
      const sourceName = decodeURIComponent(request.headers.get("x-amz-copy-source"));
      const source = await bucket.get(sourceName);
      content = source.body;
      if (source.customMetadata.thumbnail)
        customMetadata.thumbnail = source.customMetadata.thumbnail;
    }
    
    if (request.headers.has("fd-thumbnail"))
      customMetadata.thumbnail = request.headers.get("fd-thumbnail");
    
    const obj = await bucket.put(path, content, { customMetadata });
    const { key, size, uploaded } = obj;
    return new Response(JSON.stringify({ key, size, uploaded }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
 
export async function onRequestPostCreateMultipart(context) {
  // 保留原有代码不变
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();
 
  const request = context.request;
 
  const customMetadata = {};
  if (request.headers.has("fd-thumbnail"))
    customMetadata.thumbnail = request.headers.get("fd-thumbnail");
 
  const multipartUpload = await bucket.createMultipartUpload(path, {
    httpMetadata: {
      contentType: request.headers.get("content-type"),
    },
    customMetadata,
  });
 
  return new Response(
    JSON.stringify({
      key: multipartUpload.key,
      uploadId: multipartUpload.uploadId,
    })
  );
}
 
export async function onRequestPostCompleteMultipart(context) {
  // 保留原有代码不变
  const [bucket, path] = parseBucketPath(context);
  if (!bucket) return notFound();
 
  const request = context.request;
  const url = new URL(request.url);
  const uploadId = new URLSearchParams(url.search).get("uploadId");
  const multipartUpload = await bucket.resumeMultipartUpload(path, uploadId);
 
  const completeBody = await request.json();
 
  try {
    const object = await multipartUpload.complete(completeBody.parts);
    return new Response(null, {
      headers: { etag: object.httpEtag },
    });
  } catch (error) {
    return new Response(error.message, { status: 400 });
  }
}
 
export async function onRequestPost(context) {
  // 保留原有代码不变
  const url = new URL(context.request.url);
  const searchParams = new URLSearchParams(url.search);
 
  if (searchParams.has("uploads")) {
    return onRequestPostCreateMultipart(context);
  }
 
  if (searchParams.has("uploadId")) {
    return onRequestPostCompleteMultipart(context);
  }
 
  return new Response("Method not allowed", { status: 405 });
}
 
export async function onRequestDelete(context) {
  if(!get_auth_status(context)){
    var header = new Headers()
    header.set("WWW-Authenticate",'Basic realm="需要登录"')
    return new Response("没有操作权限", {
        status: 401,
        headers: header,
    });
  }
  
  const [bucket, path] = parseBucketPath(context);
  
  // 检查是否是OneDrive路径
  if (isOneDrivePath(path)) {
    try {
      const oneDriveClient = new OneDriveClient(context.env);
      const result = await oneDriveClient.deleteFile(path);
      
      if (result.ok) {
        return new Response(null, { status: 204 });
      } else {
        return new Response("删除失败", { status: result.status });
      }
    } catch (error) {
      return new Response(error.toString(), { status: 500 });
    }
  } else {
    // 原有R2存储逻辑
    if (!bucket) return notFound();
    await bucket.delete(path);
    return new Response(null, { status: 204 });
  }
}
 
export async function onRequestHead(context) {
  // 保持原有代码不变
  if(!get_auth_status(context)){
    return new Response("没有操作权限", {
        status: 403,
        headers: {
          "Content-Type": "text/plain"
        },
    });
   }
 
  return new Response(null, { status: 200 });
}
