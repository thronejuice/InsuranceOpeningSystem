import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageDriver } from './local-storage.driver.js';
import { S3StorageDriver } from './s3-storage.driver.js';
import { StorageDriver } from './storage.driver.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [
    {
      provide: StorageDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('STORAGE_DRIVER') === 's3'
          ? new S3StorageDriver(config)
          : new LocalStorageDriver(config),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
