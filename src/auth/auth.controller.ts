import { Body, Controller, Get, HttpCode, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AUTH_COOKIE, SESSION_SECONDS } from './token.util';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { LoginDto } from './dto/login.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RegisterDto, VerifyEmailDto, InstitutionalEmailDto, ResetPasswordDto, ChangePasswordDto } from './dto/account.dto';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión con correo institucional y contraseña (HU 3.2)' })
  @ApiResponse({ status: 200, type: SessionResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<SessionResponseDto> {
    const session = await this.authService.login(dto);
    res.cookie(AUTH_COOKIE, session.token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/', maxAge: SESSION_SECONDS * 1000,
    });
    return session.user;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 200, type: SessionResponseDto })
  me(@CurrentUser() id: string): Promise<SessionResponseDto> {
    return this.authService.me(id);
  }

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Crear una cuenta institucional pendiente de verificación' })
  register(@Body() dto: RegisterDto) { return this.authService.register(dto); }

  @Post('verify')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Verificar un código de seis dígitos, vigente por 15 minutos' })
  verify(@Body() dto: VerifyEmailDto) { return this.authService.verifyEmail(dto); }

  @Post('verification')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  resend(@Body() dto: InstitutionalEmailDto) { return this.authService.resend(dto.email); }

  @Post('recover')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  recover(@Body() dto: InstitutionalEmailDto) { return this.authService.recover(dto.email); }

  @Post('reset')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  reset(@Body() dto: ResetPasswordDto) { return this.authService.reset(dto); }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  async password(@CurrentUser() id: string, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.changePassword(id, dto);
    res.clearCookie(AUTH_COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    return result;
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
    @Req() req: Request & { token?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    await this.authService.logout(req.token as string);
    res.clearCookie(AUTH_COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    return { message: 'Sesión cerrada correctamente' };
  }
}
