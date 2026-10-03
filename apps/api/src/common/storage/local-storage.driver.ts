import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { StorageDriver } from './storage.driver.js';

@Injectable()
export class LocalStorageDriver extends StorageDriver {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    super();
    this.baseDir = config.get<string>('UPLOAD_DIR', './uploads');
  }

  private fullPath(relativePath: string) {
    return join(this.baseDir, relativePath);
  }

  async save(relativePath: string, data: Buffer): Promise<void> {
    const full = this.fullPath(relativePath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async read(relativePath: string): Promise<Buffer> {
    return readFile(this.fullPath(relativePath));
  }

  async delete(relativePath: string): Promise<void> {
    try {
      await unlink(this.fullPath(relativePath));
    } catch {
      // file may already be gone — ignore
    }
  }
}
