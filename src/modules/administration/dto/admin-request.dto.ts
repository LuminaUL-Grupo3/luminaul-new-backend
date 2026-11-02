import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AppealStatus,
  ManagedUserStatus,
  ReportAction,
  ReportStatus,
} from '../enums/administration.enums';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../administration.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Paginación común de los listados del panel
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, minimum: 1, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

export class ReportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus, { message: 'Estado de reporte inválido' })
  status?: ReportStatus;
}

export class AppealsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AppealStatus })
  @IsOptional()
  @IsEnum(AppealStatus, { message: 'Estado de apelación inválido' })
  status?: AppealStatus;
}

export class UsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nombre o correo' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['pending_verification', 'active', 'suspended', 'deleted'] })
  @IsOptional()
  @IsString()
  status?: string;
}

// HU 7.2 / 7.4: resolver o desestimar una denuncia
export class ResolveReportDto {
  @ApiProperty({ enum: [ReportStatus.RESOLVED, ReportStatus.DISMISSED] })
  @IsEnum([ReportStatus.RESOLVED, ReportStatus.DISMISSED], {
    message: 'El estado debe ser resolved o dismissed',
  })
  status!: ReportStatus.RESOLVED | ReportStatus.DISMISSED;

  @ApiPropertyOptional({ enum: ReportAction, default: ReportAction.NONE })
  @IsOptional()
  @IsEnum(ReportAction, { message: 'La acción debe ser delete_content o none' })
  action?: ReportAction;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000, { message: 'Las notas no pueden superar los 1000 caracteres' })
  notes?: string;
}

// HU 7.3: aprobar o rechazar una apelación
export class ResolveAppealDto {
  @ApiProperty({ enum: [AppealStatus.APPROVED, AppealStatus.REJECTED] })
  @IsEnum([AppealStatus.APPROVED, AppealStatus.REJECTED], {
    message: 'El estado debe ser approved o rejected',
  })
  status!: AppealStatus.APPROVED | AppealStatus.REJECTED;
}

// HU 7.1: suspender o reactivar una cuenta
export class ChangeUserStatusDto {
  @ApiProperty({ enum: ManagedUserStatus })
  @IsEnum(ManagedUserStatus, { message: 'El estado debe ser active o suspended' })
  status!: ManagedUserStatus;

  @ApiProperty({ example: 'Reincidencia en lenguaje ofensivo' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Debes indicar el motivo' })
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres' })
  reason!: string;
}
