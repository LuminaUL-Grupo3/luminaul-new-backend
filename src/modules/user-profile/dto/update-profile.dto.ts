import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isTotalLengthUnder100', async: false })
export class IsTotalLengthUnder100 implements ValidatorConstraintInterface {
  validate(items: unknown[], _args: ValidationArguments): boolean {
    if (!Array.isArray(items)) return true;
    const totalLength = items.reduce<number>((acc, item) => {
      return acc + (typeof item === 'string' ? item.trim().length : 0);
    }, 0);
    return totalLength <= 100;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} no puede superar los 100 caracteres en total`;
  }
}

// bio, major, academicCycle y profilePhotoUrl aceptan null para vaciar el campo
// name es inmutable y no forma parte del DTO de actualización
export class UpdateProfileDto {
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
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
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'La foto de perfil debe ser una URL válida (http:// o https://)' },
  )
  @MaxLength(255)
  profilePhotoUrl?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true, message: 'Cada habilidad admite máximo 100 caracteres' })
  @Validate(IsTotalLengthUnder100, {
    message: 'Las habilidades no pueden superar los 100 caracteres en total',
  })
  skills?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true, message: 'Cada interés admite máximo 100 caracteres' })
  @Validate(IsTotalLengthUnder100, {
    message: 'Los intereses no pueden superar los 100 caracteres en total',
  })
  interests?: string[];
}
