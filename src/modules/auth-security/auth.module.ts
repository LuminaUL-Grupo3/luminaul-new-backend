import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { RevokedTokenEntity } from './entities/revoked-token.entity';
import { AuthController } from './controller/AuthController';
import { UsersRepository } from './repository/UsersRepository';
import { UsersRepositoryImpl } from './repository/impl/UsersRepositoryImpl';
import { RevokedTokensRepository } from './repository/RevokedTokensRepository';
import { RevokedTokensRepositoryImpl } from './repository/impl/RevokedTokensRepositoryImpl';
import { PasswordHasher } from './strategy/PasswordHasher';
import { BcryptPasswordHasher } from './strategy/impl/BcryptPasswordHasher';
import { OtpGenerator } from './strategy/OtpGenerator';
import { RandomOtpGenerator } from './strategy/impl/RandomOtpGenerator';
import { MailSender } from './mail/MailSender';
import { NonBlockingMailSender } from './mail/impl/NonBlockingMailSender';
import { createMailTransport } from './factory/MailTransportFactory';
import { TokenService } from './token/TokenService';
import { HmacTokenService } from './token/impl/HmacTokenService';
import { AccessTokenCheck } from './chain/AccessTokenCheck';
import { SignatureCheck } from './chain/impl/SignatureCheck';
import { RevocationCheck } from './chain/impl/RevocationCheck';
import { TokensValidAfterCheck } from './chain/impl/TokensValidAfterCheck';
import { ActiveAccountCheck } from './chain/impl/ActiveAccountCheck';
import { OneTimeCodeService } from './service/OneTimeCodeService';
import { OneTimeCodeServiceImpl } from './service/impl/OneTimeCodeServiceImpl';
import { SessionService } from './service/SessionService';
import { SessionServiceImpl } from './service/impl/SessionServiceImpl';
import { AuthService } from './service/AuthService';
import { AuthServiceImpl } from './service/impl/AuthServiceImpl';
import { AccountVerificationService } from './service/AccountVerificationService';
import { AccountVerificationServiceImpl } from './service/impl/AccountVerificationServiceImpl';
import { PasswordService } from './service/PasswordService';
import { PasswordServiceImpl } from './service/impl/PasswordServiceImpl';
import { JwtAuthGuard } from './guard/JwtAuthGuard';
import { RolesGuard } from './guard/RolesGuard';
import { ACCESS_TOKEN_CHECKS, MAIL_TRANSPORT } from './auth.constants';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RevokedTokenEntity])],
  controllers: [AuthController],
  // Inversión de dependencias: cada abstracción recibe aquí su implementación.
  // Singleton: NestJS crea una sola instancia de cada provider y la comparte (scope por defecto).
  providers: [
    { provide: UsersRepository, useClass: UsersRepositoryImpl },
    { provide: RevokedTokensRepository, useClass: RevokedTokensRepositoryImpl },
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
    // Factory provider: arma la cadena de validación del JWT, de la regla más barata a la que
    // consulta la base de datos: firma -> revocación -> tokens_valid_after -> cuenta activa
    {
      provide: ACCESS_TOKEN_CHECKS,
      useFactory: (...checks: AccessTokenCheck[]) => checks,
      inject: [SignatureCheck, RevocationCheck, TokensValidAfterCheck, ActiveAccountCheck],
    },
    { provide: OneTimeCodeService, useClass: OneTimeCodeServiceImpl },
    { provide: SessionService, useClass: SessionServiceImpl },
    { provide: AuthService, useClass: AuthServiceImpl },
    { provide: AccountVerificationService, useClass: AccountVerificationServiceImpl },
    { provide: PasswordService, useClass: PasswordServiceImpl },
    JwtAuthGuard,
    RolesGuard,
  ],
  // Otros módulos importan AuthModule para usar @UseGuards(JwtAuthGuard, RolesGuard)
  exports: [AuthService, SessionService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
