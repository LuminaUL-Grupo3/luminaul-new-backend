import { ApiProperty } from '@nestjs/swagger';

// ---------- Reportes (HU 7.4) ----------

export class AdminReportReporterDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
}

export class AdminReportTargetDto {
  @ApiProperty({ enum: ['publication', 'message', 'review'] }) type!: string;
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) authorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) authorName!: string | null;
  // Extensión del contrato: el panel muestra "Suspender" solo si la cuenta sigue activa
  @ApiProperty({ type: String, nullable: true }) authorStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) content!: string | null;
  @ApiProperty({ type: String, nullable: true }) currentStatus!: string | null;
}

export class AdminReportDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: ['pending', 'resolved', 'dismissed'] }) status!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) resolvedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) resolutionNotes!: string | null;
  @ApiProperty({ type: AdminReportReporterDto }) reporter!: AdminReportReporterDto;
  @ApiProperty({ type: AdminReportTargetDto }) target!: AdminReportTargetDto;
}

export class AdminReportListResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ type: [AdminReportDetailDto] }) items!: AdminReportDetailDto[];
}

export class ResolveReportResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty() reportId!: string;
  @ApiProperty({ enum: ['resolved', 'dismissed'] }) status!: string;
}

// ---------- Apelaciones (HU 7.3 / 7.5) ----------

export class AdminAppealUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}

export class AdminAppealContentDto {
  @ApiProperty({ enum: ['publication', 'message', 'review'] }) type!: string;
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) text!: string | null;
  @ApiProperty({ type: String, nullable: true }) currentStatus!: string | null;
  @ApiProperty({ type: [String] }) detectedWords!: string[];
  @ApiProperty() moderatedAt!: string;
}

export class AdminAppealDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() moderationLogId!: string;
  @ApiProperty() justification!: string;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] }) status!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) resolvedAt!: string | null;
  @ApiProperty({ type: AdminAppealUserDto }) user!: AdminAppealUserDto;
  @ApiProperty({ type: AdminAppealContentDto }) content!: AdminAppealContentDto;
}

export class AdminAppealListResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ type: [AdminAppealDetailDto] }) items!: AdminAppealDetailDto[];
}

export class ResolveAppealResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty() appealId!: string;
  @ApiProperty({ enum: ['approved', 'rejected'] }) status!: string;
}

// ---------- Usuarios (HU 7.1) ----------

export class AdminUserListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['student', 'admin'] }) role!: string;
  @ApiProperty({ enum: ['pending_verification', 'active', 'suspended', 'deleted'] }) status!: string;
  @ApiProperty() isVerified!: boolean;
  @ApiProperty({ type: String, nullable: true }) suspensionReason!: string | null;
  @ApiProperty() createdAt!: string;
}

export class AdminUserListResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ type: [AdminUserListItemDto] }) items!: AdminUserListItemDto[];
}

export class ChangeUserStatusResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: ['active', 'suspended'] }) status!: string;
}

// ---------- Métricas ----------

export class AdminStatsDto {
  @ApiProperty() totalUsers!: number;
  @ApiProperty() totalActiveGroups!: number;
  @ApiProperty() totalPosts!: number;
  @ApiProperty() pendingReports!: number;
  @ApiProperty() pendingAppeals!: number;
}

// ---------- Notificaciones ----------

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: ['MODERATION', 'GROUP', 'SYSTEM'] }) type!: string;
  @ApiProperty() isRead!: boolean;
  @ApiProperty() createdAt!: string;
}

export class MarkNotificationReadResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty() id!: string;
}
