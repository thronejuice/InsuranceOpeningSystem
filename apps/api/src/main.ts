import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { RedactedLogger } from './common/audit/redacted-logger.js';
import { setupSwagger } from './common/http/swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new RedactedLogger() });
  app.setGlobalPrefix('api');

  // Security headers — applied before anything else
  app.use(helmet());

  // CORS whitelist: comma-separated origins from env (e.g. "http://localhost:4200,https://app.example.com")
  const configService = app.get(ConfigService);
  const rawOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:4200');
  const allowedOrigins = rawOrigins.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true });

  setupSwagger(app);

  const port = configService.get<number>('API_PORT', 3000);
  await app.listen(port);
}
await bootstrap();
