import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { RevokedTokenEntity } from './entities/revoked-token.entity';
import { AuthController } from './auth.controller';
import { UsersRepository } from './repositories/users.repository';
import { RevokedTokensRepository } from './repositories/revoked-tokens.repository';
import { BcryptPasswordHasher, PasswordHasher } from './providers/password-hasher';
import { OtpGenerator, RandomOtpGenerator } from './providers/otp-generator';
import { MailSender } from './providers/mail-sender';
import { NonBlockingMailSender } from './providers/non-blocking-mail-sender';
import { createMailTransport, MAIL_TRANSPORT } from './providers/mail-transport.factory';
import { HmacTokenService, TokenService } from './providers/token.service';
import {
  ActiveAccountCheck,
  RevocationCheck,
  SignatureCheck,
  TokensValidAfterCheck,
} from './policies/access-token.checks';
import { OneTimeCodeService } from './services/one-time-code.service';
import { SessionService } from './services/session.service';
import { AuthService } from './services/auth.service';
import { AccountVerificationService } from './services/account-verification.service';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RevokedTokenEntity])],
  controllers: [AuthController],
  providers: [
    UsersRepository,
    RevokedTokensRepository,
    // Inversión de dependencias: los servicios piden la abstracción, aquí se elige la implementación
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    { provide: OtpGenerator, useClass: RandomOtpGenerator },
    // Transporte real del correo (consola o SMTP según MAIL_TRANSPORT), envuelto para no bloquear
    { provide: MAIL_TRANSPORT, useFactory: createMailTransport, inject: [ConfigService] },
    {
      provide: MailSender,
      useFactory: (transport: MailSender) => new NonBlockingMailSender(transport),
      inject: [MAIL_TRANSPORT],
    },
    { provide: TokenService, useClass: HmacTokenService },
    SignatureCheck,
    RevocationCheck,
    TokensValidAfterCheck,
    ActiveAccountCheck,
    OneTimeCodeService,
    SessionService,
    AuthService,
    AccountVerificationService,
    PasswordRecoveryService,
    JwtAuthGuard,
    RolesGuard,
  ],
  // Otros módulos importan AuthModule para usar @UseGuards(JwtAuthGuard, RolesGuard)
  exports: [AuthService, SessionService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
