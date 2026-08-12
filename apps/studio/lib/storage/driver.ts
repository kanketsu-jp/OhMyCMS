export type StorageDriver = {
  name: string;
  put(key: string, body: Buffer | ReadableStream, contentType?: string): Promise<void>;
  get(key: string): Promise<ReadableStream | Buffer>;
  head(key: string): Promise<{ size: number; contentType?: string } | null>;
  delete(key: string): Promise<void>;
  deletePrefix?(prefix: string): Promise<void>;
};
