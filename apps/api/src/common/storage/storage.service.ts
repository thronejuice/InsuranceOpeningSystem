import { Injectable } from '@nestjs/common';
import { StorageDriver } from './storage.driver.js';

@Injectable()
export class StorageService {
  constructor(private readonly driver: StorageDriver) {}

  save(relativePath: string, data: Buffer) { return this.driver.save(relativePath, data); }
  read(relativePath: string) { return this.driver.read(relativePath); }
  delete(relativePath: string) { return this.driver.delete(relativePath); }
}
