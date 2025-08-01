// /utils/onedrive.ts
export class OneDriveClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  
  constructor(env) {
    this.clientId = env.ONEDRIVE_CLIENT_ID;
    this.clientSecret = env.ONEDRIVE_CLIENT_SECRET;
    this.refreshToken = env.ONEDRIVE_REFRESH_TOKEN;
  }
  
  async getAccessToken() {
    const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token"
      })
    });
    
    const data = await response.json();
    if (data.error) {
      throw new Error(`获取访问令牌失败: ${data.error_description || data.error}`);
    }
    return data.access_token;
  }
  
  async uploadFile(path, content, options = {}) {
    const accessToken = await this.getAccessToken();
    
    // 处理路径，移除"onedrive/"前缀
    const formattedPath = path.replace(/^onedrive\//, "");
    
    // 使用OneDrive API上传文件
    const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${formattedPath}:/content`;
    
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": options.contentType || "application/octet-stream"
      },
      body: content
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`上传失败: ${error.error ? error.error.message : '未知错误'}`);
    }
    
    const result = await response.json();
    return {
      key: path,
      size: result.size,
      uploaded: result.lastModifiedDateTime
    };
  }
  
  async listItems(path) {
    const accessToken = await this.getAccessToken();
    
    // 处理路径，移除"onedrive/"前缀
    const formattedPath = path.replace(/^onedrive\//, "");
    
    // 构建API URL
    const apiUrl = formattedPath 
      ? `https://graph.microsoft.com/v1.0/me/drive/root:/${formattedPath}:/children` 
      : "https://graph.microsoft.com/v1.0/me/drive/root/children";
      
    const response = await fetch(apiUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`获取文件列表失败: ${error.error ? error.error.message : '未知错误'}`);
    }
    
    const data = await response.json();
    
    // 转换为FlareDrive格式
    const files = data.value
      .filter(item => !item.folder)
      .map(item => ({
        key: `onedrive/${formattedPath ? formattedPath + '/' : ''}${item.name}`,
        size: item.size,
        uploaded: item.lastModifiedDateTime,
        httpMetadata: { contentType: item.file?.mimeType },
        customMetadata: {}
      }));
      
    const folders = data.value
      .filter(item => item.folder)
      .map(item => `onedrive/${formattedPath ? formattedPath + '/' : ''}${item.name}/`);
      
    return { files, folders };
  }
  
  async getFileContent(path) {
    const accessToken = await this.getAccessToken();
    const formattedPath = path.replace(/^onedrive\//, "");
    
    // 获取下载URL
    const apiUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${formattedPath}`;
    const response = await fetch(apiUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`获取文件信息失败，状态码: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data["@microsoft.graph.downloadUrl"]) {
      throw new Error("找不到文件下载链接");
    }
    
    // 使用@microsoft.graph.downloadUrl获取文件内容
    return fetch(data["@microsoft.graph.downloadUrl"]);
  }
  
  async deleteFile(path) {
    const accessToken = await this.getAccessToken();
    const formattedPath = path.replace(/^onedrive\//, "");
    
    const apiUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${formattedPath}`;
    return fetch(apiUrl, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });
  }
}
 
// 辅助函数：检查路径是否指向OneDrive
export function isOneDrivePath(path) {
  return path && path.startsWith("onedrive/");
}
