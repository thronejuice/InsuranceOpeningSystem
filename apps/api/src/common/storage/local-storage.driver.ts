import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { StorageDriver } from './storage.driver.js';

@Injectable()
export class LocalStorageDriver extends StorageDriver {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    super();
    this.baseDir = resolve(config.get<string>('UPLOAD_DIR', './uploads'));
  }

  /** Rejects any relativePath (e.g. containing `..`) that would resolve outside baseDir. */
  private fullPath(relativePath: string) {
    const full = resolve(this.baseDir, relativePath);
    if (full !== this.baseDir && !full.startsWith(this.baseDir + sep)) {
      throw new Error(`Storage path escapes upload directory: ${relativePath}`);
    }
    return full;
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
