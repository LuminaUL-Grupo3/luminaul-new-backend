import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AUTH_COOKIE, AUTH_MESSAGES, SESSION_COOKIE_OPTIONS } from '../auth.constants';
import { AuthService } from '../service/AuthService';
import { SessionService } from '../service/SessionService';
import { AccountVerificationService } from '../service/AccountVerificationService';
import { PasswordService } from '../service/PasswordService';
import { AuthenticatedRequest, JwtAuthGuard } from '../guard/JwtAuthGuard';
import { AuthException } from '../exception/AuthException';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RegisterDto } from '../dto/RegisterDto';
import { LoginDto } from '../dto/LoginDto';
import { VerifyEmailDto } from '../dto/VerifyEmailDto';
import { ResendCodeDto } from '../dto/ResendCodeDto';
import { ForgotPasswordDto } from '../dto/ForgotPasswordDto';
import { ResetPasswordDto } from '../dto/ResetPasswordDto';
import { ChangePasswordDto } from '../dto/ChangePasswordDto';
import { AuthUserDto } from '../dto/AuthUserDto';
import { LoginResponseDto } from '../dto/LoginResponseDto';
import { MessageResponseDto } from '../dto/MessageResponseDto';
import { RegisterResponseDto } from '../dto/RegisterResponseDto';
import { VerifyEmailResponseDto } from '../dto/VerifyEmailResponseDto';
import { LogoutResponseDto } from '../dto/LogoutResponseDto';

// Solo traduce HTTP a llamadas de servicio; las reglas viven en service/.
// Depende de las abstracciones; AuthModule elige las implementaciones.
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly accountVerificationService: AccountVerificationService,
    private readonly passwordService: PasswordService,
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
    return this.passwordService.forgotPassword(dto);
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
    return this.passwordService.resetPassword(dto);
  }

  @Put('password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cambiar la contraseña del usuario autenticado (Settings)',
    description: 'Verifica la contraseña actual, guarda la nueva y cierra todas las sesiones.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Contraseña actual incorrecta, nueva igual a la actual o formato inválido',
  })
  changePassword(
    @CurrentUser() userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    return this.passwordService.changePassword(userId, dto);
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
      throw new AuthException(AUTH_MESSAGES.MISSING_TOKEN, HttpStatus.UNAUTHORIZED);
    }
    await this.sessionService.revoke(req.token);
    res.clearCookie(AUTH_COOKIE, SESSION_COOKIE_OPTIONS);
    return { message: AUTH_MESSAGES.LOGGED_OUT };
  }

  @Delete(['me', 'account'])
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
