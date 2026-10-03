export abstract class StorageDriver {
  abstract save(relativePath: string, data: Buffer): Promise<void>;
  abstract read(relativePath: string): Promise<Buffer>;
  abstract delete(relativePath: string): Promise<void>;
}
