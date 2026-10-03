import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';
import { SequenceModule } from '../../common/sequence/sequence.module.js';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    SequenceModule,
  ],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
