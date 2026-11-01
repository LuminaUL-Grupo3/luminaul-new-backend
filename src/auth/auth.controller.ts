import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CookieOptions, Response } from 'express';
import { AUTH_COOKIE } from './token.util';
import { AUTH_MESSAGES } from './auth.constants';
import { AuthService } from './services/auth.service';
import { SessionService } from './services/session.service';
import { AccountVerificationService } from './services/account-verification.service';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { AuthenticatedRequest, JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  AuthUserDto,
  LoginResponseDto,
  MessageResponseDto,
  RegisterResponseDto,
  VerifyEmailResponseDto,
} from './dto/auth-response.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';

// Cookie httpOnly en paralelo al Bearer: el frontend actual usa credentials: 'include'
const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

// Solo traduce HTTP a llamadas de servicio; las reglas viven en services/
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly accountVerificationService: AccountVerificationService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
  ) {}

  @Post('register')
  @ApiOperation({
    summary: 'Registrar cuenta institucional',
    description: 'Crea el usuario y su perfil en una sola transacción y envía un código OTP.',
  })
  @ApiResponse({ status: 201, type: RegisterResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos o correo no institucional' })
  @ApiResponse({ status: 409, description: AUTH_MESSAGES.EMAIL_TAKEN })
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: AUTH_MESSAGES.INVALID_CREDENTIALS })
  @ApiResponse({ status: 403, description: 'Cuenta pendiente de verificación o suspendida' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.authService.login(dto);
    res.cookie(AUTH_COOKIE, result.accessToken, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: this.sessionService.ttlSeconds * 1000,
    });
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario de la sesión actual' })
  @ApiResponse({ status: 200, type: AuthUserDto })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido, revocado o invalidado' })
  me(@CurrentUser() userId: string): Promise<AuthUserDto> {
    return this.authService.me(userId);
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verificar correo con el código OTP' })
  @ApiResponse({ status: 200, type: VerifyEmailResponseDto })
  @ApiResponse({ status: 400, description: AUTH_MESSAGES.INVALID_CODE })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    return this.accountVerificationService.verifyEmail(dto);
  }

  @Post('resend-code')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reenviar el código de verificación (vigencia de 15 minutos)' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  resendCode(@Body() dto: ResendCodeDto): Promise<MessageResponseDto> {
    return this.accountVerificationService.resendCode(dto);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Solicitar código para restablecer la contraseña' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    return this.passwordRecoveryService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Restablecer la contraseña',
    description: 'Cambia la contraseña e invalida todas las sesiones abiertas.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 400, description: AUTH_MESSAGES.INVALID_CODE })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.passwordRecoveryService.resetPassword(dto);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cerrar sesión',
    description:
      'Revoca el token de acceso actual. Cualquier uso posterior del mismo token será rechazado con 401.',
  })
  @ApiResponse({ status: 200, description: 'Sesión cerrada', type: LogoutResponseDto })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido, expirado o ya revocado' })
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    if (!req.token) {
      throw new UnauthorizedException(AUTH_MESSAGES.MISSING_TOKEN);
    }
    await this.sessionService.revoke(req.token);
    res.clearCookie(AUTH_COOKIE, SESSION_COOKIE_OPTIONS);
    return { message: AUTH_MESSAGES.LOGGED_OUT };
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Eliminar mi cuenta',
    description: 'Borrado lógico: la cuenta queda en estado deleted y se cierran todas sus sesiones.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async deleteAccount(
    @CurrentUser() userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const result = await this.authService.deleteAccount(userId);
    res.clearCookie(AUTH_COOKIE, SESSION_COOKIE_OPTIONS);
    return result;
  }
}
