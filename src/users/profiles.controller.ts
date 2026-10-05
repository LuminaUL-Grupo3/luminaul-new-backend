import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProfilesService } from './profiles.service';
import { AvailabilityDto, UpdateProfileDto } from './dto/profile.dto';

@ApiTags('Profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly service: ProfilesService) {}
  @Get('me') me(@CurrentUser() id: string) { return this.service.find(id); }
  @Put('me') update(@CurrentUser() id: string, @Body() dto: UpdateProfileDto) { return this.service.update(id, dto); }
  @Post('me/photo')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { photo: { type: 'string', format: 'binary' } }, required: ['photo'] } })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  photo(@CurrentUser() id: string, @UploadedFile() file?: Express.Multer.File) { return this.service.photo(id, file); }
  @Get(':id') find(@Param('id', ParseUUIDPipe) id: string) { return this.service.find(id); }
}

@ApiTags('Availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly service: ProfilesService) {}
  @Post() create(@CurrentUser() userId: string, @Body() dto: AvailabilityDto) { return this.service.saveAvailability(userId, dto); }
  @Put(':id') update(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AvailabilityDto) { return this.service.saveAvailability(userId, dto, id); }
  @Delete(':id') remove(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.deleteAvailability(userId, id); }
}
