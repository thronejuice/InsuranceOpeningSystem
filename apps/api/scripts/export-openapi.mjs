import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { AppModule } from '../dist/app.module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Insurance Opening System API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outPath = path.resolve(__dirname, '../openapi.json');
  fs.writeFileSync(outPath, JSON.stringify(document, null, 2), 'utf-8');
  await app.close();
  console.log('OpenAPI exported to:', outPath);
}

exportOpenApi().catch((err) => {
  console.error('Failed to export OpenAPI:', err);
  process.exit(1);
});

