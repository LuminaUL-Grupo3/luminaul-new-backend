import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { TARGET_CONTENT_TYPES, TargetContentType } from '../enums/moderation.enums';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// HU 6.1: POST /moderation/reports
export class CreateReportDto {
  @ApiProperty({ example: 'Lenguaje ofensivo e insultos reiterados hacia un compañero', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Debes indicar el motivo del reporte' })
  @MaxLength(255, { message: 'El motivo no puede superar los 255 caracteres' })
  reason!: string;

  @ApiProperty({ enum: TARGET_CONTENT_TYPES, example: TargetContentType.PUBLICATION })
  @IsIn(TARGET_CONTENT_TYPES, { message: 'El tipo de contenido debe ser publication, message o review' })
  targetType!: TargetContentType;

  @ApiProperty({ format: 'uuid', example: '18938a12-6f2b-4d43-9801-bca908234fed' })
  @IsUUID('4', { message: 'El identificador del contenido no es válido' })
  targetId!: string;
}

// HU 6.4: POST /moderation/appeals
export class CreateAppealDto {
  @ApiProperty({ format: 'uuid', example: 'e6a21033-88bb-4900-a2d3-450912390abc' })
  @IsUUID('4', { message: 'El identificador de la moderación no es válido' })
  moderationLogId!: string;

  @ApiProperty({
    example: 'El término utilizado corresponde a un tecnicismo de ingeniería y no pretendía ofender.',
    maxLength: 1000,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Debes escribir una justificación' })
  @MaxLength(1000, { message: 'La justificación no puede superar los 1000 caracteres' })
  justification!: string;
}
