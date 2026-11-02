import { ApiProperty } from '@nestjs/swagger';
import {
  AppealStatus,
  ModerationResult,
  ReportStatus,
  TARGET_CONTENT_TYPES,
  TargetContentType,
} from '../enums/moderation.enums';

export class CreateReportResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty({ format: 'uuid' }) reportId!: string;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
}

export class ReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) reporterId!: string;
  @ApiProperty({ enum: TARGET_CONTENT_TYPES }) targetType!: TargetContentType;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
  @ApiProperty() createdAt!: string;
}

export class CreateAppealResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty({ format: 'uuid' }) appealId!: string;
  @ApiProperty({ enum: AppealStatus }) status!: AppealStatus;
}

// HU 6.3: cada contenido propio ocultado por el motor, con el estado de su apelación
export class ModerationLogDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TARGET_CONTENT_TYPES }) contentType!: TargetContentType;
  @ApiProperty({ format: 'uuid' }) contentId!: string;
  @ApiProperty({ enum: ModerationResult }) result!: ModerationResult;
  @ApiProperty({ type: [String], description: 'Palabras que motivaron la moderación' })
  detectedWords!: string[];
  @ApiProperty({ nullable: true, description: 'Texto moderado; null si el contenido ya fue eliminado' })
  content!: string | null;
  @ApiProperty() moderatedAt!: string;
  @ApiProperty({ enum: AppealStatus, nullable: true, description: 'null si aún no se apeló' })
  appealStatus!: AppealStatus | null;
  @ApiProperty({ description: 'true si el alumno todavía puede apelar esta moderación' })
  canAppeal!: boolean;
}
