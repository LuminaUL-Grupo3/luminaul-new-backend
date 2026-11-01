import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserProfileService } from './user-profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAvailabilityDto, UpdateAvailabilityDto } from './dto/availability.dto';
import {
  AvailabilityActionResponseDto,
  DeleteAvailabilityResponseDto,
  StudentProfileDto,
} from './dto/profile-response.dto';

@ApiTags('Profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class UserProfileController {
  constructor(private readonly service: UserProfileService) {}

  // Las rutas /me van antes de /:userId para que "me" no se interprete como un id
  @Get('me')
  @ApiOperation({ summary: 'Perfil completo del usuario en sesión (SPEC-02)' })
  @ApiResponse({ status: 200, type: StudentProfileDto })
  getMyProfile(@CurrentUser() userId: string): Promise<StudentProfileDto> {
    return this.service.getProfile(userId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Actualizar el perfil propio (SPEC-02)' })
  @ApiResponse({ status: 200, type: StudentProfileDto })
  updateMyProfile(
    @CurrentUser() userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<StudentProfileDto> {
    return this.service.updateProfile(userId, dto);
  }

  @Post('me/availability')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar una franja horaria libre (SPEC-02)' })
  @ApiResponse({ status: 201, type: AvailabilityActionResponseDto })
  @ApiResponse({ status: 400, description: 'Horario fuera de rango o traslapado' })
  createAvailability(
    @CurrentUser() userId: string,
    @Body() dto: CreateAvailabilityDto,
  ): Promise<AvailabilityActionResponseDto> {
    return this.service.createAvailability(userId, dto);
  }

  @Put('me/availability/:availabilityId')
  @ApiOperation({ summary: 'Editar una franja horaria propia (SPEC-02)' })
  @ApiResponse({ status: 200, type: AvailabilityActionResponseDto })
  @ApiResponse({ status: 400, description: 'Horario fuera de rango o traslapado' })
  @ApiResponse({ status: 404, description: 'La franja no existe o no es del usuario' })
  updateAvailability(
    @CurrentUser() userId: string,
    @Param('availabilityId', ParseUUIDPipe) availabilityId: string,
    @Body() dto: UpdateAvailabilityDto,
  ): Promise<AvailabilityActionResponseDto> {
    return this.service.updateAvailability(userId, availabilityId, dto);
  }

  @Delete('me/availability/:availabilityId')
  @ApiOperation({ summary: 'Eliminar una franja horaria propia (SPEC-02)' })
  @ApiResponse({ status: 200, type: DeleteAvailabilityResponseDto })
  @ApiResponse({ status: 404, description: 'La franja no existe o no es del usuario' })
  deleteAvailability(
    @CurrentUser() userId: string,
    @Param('availabilityId', ParseUUIDPipe) availabilityId: string,
  ): Promise<DeleteAvailabilityResponseDto> {
    return this.service.deleteAvailability(userId, availabilityId);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Perfil público de un compañero (SPEC-02)' })
  @ApiResponse({ status: 200, type: StudentProfileDto })
  @ApiResponse({ status: 404, description: 'Perfil no encontrado' })
  getProfile(@Param('userId', ParseUUIDPipe) userId: string): Promise<StudentProfileDto> {
    return this.service.getProfile(userId);
  }
}
