import { Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AUTH_COOKIE } from './token.util';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LogoutResponseDto } from './dto/logout-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
    res.clearCookie(AUTH_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
    return { message: 'Sesión cerrada correctamente' };
  }
}
