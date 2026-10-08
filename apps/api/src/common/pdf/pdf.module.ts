import { Global, Module } from '@nestjs/common';
import { PdfRendererService } from './pdf-renderer.service.js';

@Global()
@Module({
  providers: [PdfRendererService],
  exports: [PdfRendererService],
})
export class PdfModule {}
