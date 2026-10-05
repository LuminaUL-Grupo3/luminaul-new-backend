import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RevokedTokenEntity } from './entities/revoked-token.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserEntity } from '../users/entities/user.entity';
import { AuthRepository } from './auth.repository';
import { PasswordHasher } from './password-hasher';
import { MailDelivery, SmtpMailDelivery } from './mail-delivery';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

@Module({
  imports: [TypeOrmModule.forFeature([RevokedTokenEntity, UserEntity])],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, PasswordHasher, JwtAuthGuard, AuthRateLimitGuard, { provide: MailDelivery, useClass: SmtpMailDelivery }],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
