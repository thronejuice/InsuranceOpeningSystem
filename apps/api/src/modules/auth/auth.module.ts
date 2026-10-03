import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';

@Module({
  // Limits are set per route with @Throttle; this default only applies where LoginThrottlerGuard is used
  imports: [ThrottlerModule.forRoot([{ name: 'default', limit: 5, ttl: 60_000 }])],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, LoginThrottlerGuard],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // The refresh token cookie is only sent to /api/auth, so no other module needs cookie parsing
    consumer.apply(cookieParser()).forRoutes(AuthController);
  }
}
