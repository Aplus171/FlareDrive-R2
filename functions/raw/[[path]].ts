import { notFound, parseBucketPath } from "@/utils/bucket";
import { OneDriveClient, isOneDrivePath } from "@/utils/onedrive";
 
export async function onRequestGet(context) {
  const [bucket, path] = parseBucketPath(context);
  
  // 检查是否是OneDrive路径
  if (isOneDrivePath(path)) {
    try {
      const oneDriveClient = new OneDriveClient(context.env);
      const fileResponse = await oneDriveClient.getFileContent(path);
      
      if (!fileResponse.ok) {
        return new Response(`OneDrive文件获取失败: ${fileResponse.statusText}`, { 
          status: fileResponse.status 
        });
      }
      
      // 转发OneDrive的响应
      const headers = new Headers();
      fileResponse.headers.forEach((value, key) => {
        // 只复制必要的头部信息
        if (["content-type", "content-length", "last-modified", "etag"].includes(key.toLowerCase())) {
          headers.set(key, value);
        }
      });
      
      return new Response(fileResponse.body, {
        headers
      });
    } catch (error) {
      console.error("OneDrive文件获取错误:", error);
      return new Response(`文件不存在或无法访问: ${error.message}`, { status: 404 });
    }
  } else {
    // 原有R2存储逻辑
    if (!bucket) return notFound();

    const url = context.env["PUBURL"] + "/" + context.request.url.split("/raw/")[1]

  var response =await fetch(new Request(url, {
    body: context.request.body,
    headers: context.request.headers,
    method: context.request.method,
    redirect: "follow",
}))


  const headers = new Headers(response.headers);
  if (path.startsWith("_$flaredrive$/thumbnails/")){
    headers.set("Cache-Control", "max-age=31536000");
  }

  return new Response(response.body, {
    headers: headers,
    status: response.status,
    statusText: response.statusText
});
    
    try {
      const object = await bucket.get(path);
      if (object === null) return notFound();
      
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      
      return new Response(object.body, { headers });
    } catch (e) {
      return notFound();
    }
  }
}
}
