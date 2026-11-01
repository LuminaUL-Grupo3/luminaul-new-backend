import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

// bio, major, academicCycle y profilePhotoUrl aceptan null para vaciar el campo
export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 100, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  major?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  academicCycle?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true })
  @IsOptional()
  @IsUrl({}, { message: 'La foto de perfil debe ser una URL válida' })
  @MaxLength(255)
  profilePhotoUrl?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true, message: 'Cada habilidad admite máximo 50 caracteres' })
  skills?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true, message: 'Cada interés admite máximo 50 caracteres' })
  interests?: string[];
}
