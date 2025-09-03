import { BlobServiceClient, ContainerClient, BlockBlobClient, BlobUploadCommonResponse } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

// Production-ready Azure Blob Storage service
class AzureStorageService {
  private blobServiceClient: BlobServiceClient;
  private containerName: string;
  private containerClient: ContainerClient;
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'uploads';

    this.containerName = containerName;

    if (connectionString) {
      // Use connection string (recommended for development)
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    } else if (accountName) {
      // Use DefaultAzureCredential for production (managed identity, etc.)
      const credential = new DefaultAzureCredential();
      this.blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential
      );
    } else {
      throw new Error(
        'Azure Storage configuration missing. Please set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME'
      );
    }

    this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
  }

  /**
   * Initialize the Azure storage service and ensure container exists
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // Ensure container exists with proper access level
      const containerExists = await this.containerClient.exists();
      if (!containerExists) {
        await this.containerClient.create({
          access: 'blob', // Public read access for uploaded files
        });
        console.log(`Created Azure Blob container: ${this.containerName}`);
      }
      this.initialized = true;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to initialize Azure Blob Storage:', error);
      }
      throw error;
    }
  }

  /**
   * Generate a unique blob name with timestamp and random suffix
   */
  private generateBlobName(originalName: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extension = originalName.split('.').pop();
    const nameWithoutExtension = originalName.split('.').slice(0, -1).join('.');
    
    return `${timestamp}-${randomSuffix}-${nameWithoutExtension}.${extension}`;
  }

  /**
   * Upload a file to Azure Blob Storage with optimizations
   */
  async uploadFile(
    file: File | Buffer | ArrayBuffer,
    originalName: string,
    options: {
      contentType?: string;
      metadata?: Record<string, string>;
      tags?: Record<string, string>;
      overwrite?: boolean;
    } = {}
  ): Promise<{
    url: string;
    downloadUrl: string;
    pathname: string;
    size: number;
    etag: string;
  }> {
    await this.initialize();

    const blobName = this.generateBlobName(originalName);
    const blockBlobClient: BlockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    try {
      let data: Buffer | Uint8Array;
      let size: number;

      if (file instanceof File) {
        data = new Uint8Array(await file.arrayBuffer());
        size = file.size;
      } else if (file instanceof ArrayBuffer) {
        data = new Uint8Array(file);
        size = file.byteLength;
      } else {
        data = file;
        size = file.length;
      }

      // Upload with optimizations
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: options.contentType || 'application/octet-stream',
          blobCacheControl: 'public, max-age=31536000', // Cache for 1 year
        },
        metadata: {
          originalName,
          uploadedAt: new Date().toISOString(),
          ...options.metadata,
        },
        tags: options.tags,
        // Enable parallel upload for larger files
        blockSize: 4 * 1024 * 1024, // 4MB blocks
        concurrency: 3, // Concurrent uploads
      };

      const uploadResponse: BlobUploadCommonResponse = await blockBlobClient.uploadData(
        data,
        uploadOptions
      );

      // Return standardized response matching Vercel Blob format
      return {
        url: blockBlobClient.url,
        downloadUrl: blockBlobClient.url, // Same as url for Azure
        pathname: blobName,
        size,
        etag: uploadResponse.etag || '',
      };
    } catch (error) {
      // Prevent memory leaks by limiting error logging
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to upload file to Azure Blob Storage:', error);
      }
      throw new Error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a blob from Azure Blob Storage
   */
  async deleteFile(blobName: string): Promise<void> {
    await this.initialize();

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete file from Azure Blob Storage:', error);
      }
      throw new Error(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a blob exists
   */
  async fileExists(blobName: string): Promise<boolean> {
    await this.initialize();

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      return await blockBlobClient.exists();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to check file existence:', error);
      }
      return false;
    }
  }

  /**
   * Get file metadata and properties
   */
  async getFileProperties(blobName: string) {
    await this.initialize();

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      const properties = await blockBlobClient.getProperties();
      
      return {
        size: properties.contentLength,
        contentType: properties.contentType,
        lastModified: properties.lastModified,
        etag: properties.etag,
        metadata: properties.metadata,
        url: blockBlobClient.url,
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to get file properties:', error);
      }
      throw new Error(`Get properties failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List files in the container with pagination
   */
  async listFiles(options: {
    prefix?: string;
    maxResults?: number;
    continuationToken?: string;
  } = {}) {
    await this.initialize();

    try {
      const listOptions = {
        prefix: options.prefix,
      };

      const blobs = [];
      const iterator = this.containerClient.listBlobsFlat(listOptions);
      
      let count = 0;
      const maxResults = options.maxResults || 1000;

      for await (const blob of iterator) {
        if (count >= maxResults) break;
        
        blobs.push({
          name: blob.name,
          size: blob.properties.contentLength,
          lastModified: blob.properties.lastModified,
          contentType: blob.properties.contentType,
          etag: blob.properties.etag,
          url: `${this.containerClient.url}/${blob.name}`,
        });
        
        count++;
      }

      return {
        blobs,
        hasMore: count === maxResults,
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to list files:', error);
      }
      throw new Error(`List files failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Singleton instance for production efficiency
let azureStorageInstance: AzureStorageService | null = null;

export const getAzureStorage = (): AzureStorageService => {
  if (!azureStorageInstance) {
    azureStorageInstance = new AzureStorageService();
  }
  return azureStorageInstance;
};

// Export the service class for testing
export { AzureStorageService };

// Helper functions matching Vercel Blob API for easy migration
export const uploadFileToAzure = async (
  file: File | Buffer | ArrayBuffer,
  filename: string,
  options?: {
    contentType?: string;
    metadata?: Record<string, string>;
    tags?: Record<string, string>;
  }
) => {
  const storage = getAzureStorage();
  return storage.uploadFile(file, filename, options);
};

export const deleteFileFromAzure = async (pathname: string) => {
  const storage = getAzureStorage();
  return storage.deleteFile(pathname);
};