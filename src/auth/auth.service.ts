import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashToken, JwtPayload, verifyJwt, signJwt } from './token.util';
import { AuthRepository } from './auth.repository';
import { PasswordHasher } from './password-hasher';
import { LoginDto } from './dto/login.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { UserEntity } from '../users/entities/user.entity';
import { createHmac, randomInt, randomBytes } from 'crypto';
import { RegisterDto, VerifyEmailDto, ResetPasswordDto, ChangePasswordDto } from './dto/account.dto';
import { MailDelivery } from './mail-delivery';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordHasher,
    private readonly configService: ConfigService,
    private readonly mail: MailDelivery,
  ) {}

  async login(dto: LoginDto): Promise<{ user: SessionResponseDto; token: string }> {
    const user = await this.repository.findByEmail(dto.email);
    // Hash válido para mantener el trabajo de comparación incluso con correos inexistentes.
    const fallbackHash = '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const valid = await this.passwords.verify(dto.password, user?.passwordHash || fallbackHash);
    if (!user || !valid) throw new UnauthorizedException('Correo o contraseña incorrectos');
    this.requireActive(user);
    return {
      user: this.toSession(user),
      token: signJwt({ sub: user.id, email: user.email, role: user.role, version: user.sessionVersion }, this.secret),
    };
  }

  async me(id: string): Promise<SessionResponseDto> {
    const user = await this.repository.findById(id);
    if (!user) throw new UnauthorizedException('La cuenta no está disponible');
    this.requireActive(user);
    return this.toSession(user);
  }

  private requireActive(user: UserEntity): void {
    if (user.status !== 'active' || !user.isVerified) {
      throw new ForbiddenException('Tu cuenta debe estar activa y verificada para ingresar');
    }
  }

  private toSession(user: UserEntity): SessionResponseDto {
    return { id: user.id, email: user.email, name: user.profile?.name || 'Usuario', role: user.role };
  }

  private get secret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('JWT_SECRET no está configurado');
    }
    return secret;
  }

  // Valida firma/expiración y que el token no haya sido revocado por un logout previo
  async validateToken(token: string): Promise<JwtPayload> {
    const payload = verifyJwt(token, this.secret);
    if (!payload) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (await this.repository.isRevoked(hashToken(token))) {
      throw new UnauthorizedException('La sesión ya fue cerrada');
    }
    const user = await this.repository.findById(payload.sub);
    if (!user || (payload.version ?? 0) !== user.sessionVersion) throw new UnauthorizedException('La sesión venció. Inicia sesión nuevamente.');
    this.requireActive(user);
    return { ...payload, email: user.email, role: user.role };
  }

  // Cierra sesión revocando el token hasta su expiración. Idempotente.
  async logout(token: string): Promise<void> {
    const payload = verifyJwt(token, this.secret);
    if (!payload) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    await this.repository.revoke(hashToken(token), payload.sub, new Date(payload.exp * 1000));
  }

  private verificationHash(email: string, code: string): string {
    return createHmac('sha256', this.secret).update(`verify:${email}:${code}`).digest('hex');
  }

  private async sendCode(email: string, code: string): Promise<boolean> {
    try {
      await this.mail.send(email, 'Verifica tu cuenta de LuminaUL', `Tu código de verificación es: ${code}\n\nVence en 15 minutos. Si no solicitaste una cuenta, ignora este mensaje.`);
      return true;
    } catch {
      this.logger.error('No se pudo entregar el correo de verificación. Revisa la configuración SMTP.');
      return false;
    }
  }

  async register(dto: RegisterDto) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.repository.register(dto.name, dto.email, await this.passwords.hash(dto.password), this.verificationHash(dto.email, code), new Date(Date.now() + 15 * 60_000));
    const sent = await this.sendCode(dto.email, code);
    return {
      email: dto.email, email_sent: sent,
      message: sent ? 'Cuenta creada. Revisa tu correo para verificarla.' : 'Cuenta creada. No se pudo enviar el correo; solicita otro código en la siguiente pantalla.',
    };
  }

  async resend(email: string) {
    const user = await this.repository.findByEmail(email);
    if (user && user.status === 'pending_verification' && !user.isVerified) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const updated = await this.repository.setVerification(user.id, this.verificationHash(email, code), new Date(Date.now() + 15 * 60_000));
      if (updated && !(await this.sendCode(email, code))) throw new ServiceUnavailableException('No se pudo enviar el correo. Inténtalo nuevamente en unos minutos.');
    }
    return { message: 'Si la cuenta está pendiente de verificación, recibirás un nuevo código.' };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const result = await this.repository.verifyEmail(dto.email, this.verificationHash(dto.email, dto.code));
    if (result === 'blocked') throw new BadRequestException('Alcanzaste el límite de intentos. Solicita un nuevo código.');
    if (result === 'expired') throw new BadRequestException('El código venció. Solicita uno nuevo.');
    if (result !== 'ok') throw new BadRequestException('El código no es válido para esta cuenta.');
    return { message: 'Cuenta verificada. Ya puedes iniciar sesión.' };
  }

  async recover(email: string) {
    const user = await this.repository.findByEmail(email);
    if (user?.isVerified && user.status === 'active') {
      const token = randomBytes(32).toString('hex');
      await this.repository.setReset(user.id, hashToken(token), new Date(Date.now() + 15 * 60_000));
      try {
        const link = new URL('/restablecer', this.configService.get<string>('WEB_ORIGIN') || 'http://localhost:5173');
        link.searchParams.set('token', token);
        await this.mail.send(email, 'Recupera tu acceso a LuminaUL', `Abre este enlace para crear una nueva contraseña:\n${link.href}\n\nVence en 15 minutos y solo puede usarse una vez. Si no lo solicitaste, ignora este mensaje.`);
      } catch { this.logger.error('No se pudo entregar el correo de recuperación. Revisa la configuración SMTP.'); }
    }
    return { message: 'Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.' };
  }

  async reset(dto: ResetPasswordDto) {
    if (!(await this.repository.resetPassword(hashToken(dto.token), await this.passwords.hash(dto.password)))) throw new BadRequestException('El enlace no es válido o venció. Solicita uno nuevo.');
    return { message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' };
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.repository.findById(id);
    if (!user || !(await this.passwords.verify(dto.current_password, user.passwordHash))) throw new BadRequestException('La contraseña actual no es correcta.');
    if (!(await this.repository.changePassword(id, user.passwordHash, await this.passwords.hash(dto.password)))) throw new BadRequestException('La cuenta cambió. Inicia sesión nuevamente.');
    return { message: 'Contraseña actualizada. Inicia sesión nuevamente.' };
  }
}
