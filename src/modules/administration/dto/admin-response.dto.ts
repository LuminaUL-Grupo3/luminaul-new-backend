import { ApiProperty } from '@nestjs/swagger';
import type { AppealRow, ReportRow, StatsRow, UserRow } from '../repository/AdminRepository';
import type { NotificationEntity } from '../entities/notification.entity';

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

// Cada DTO de respuesta sabe construirse a partir de la fila que devuelve el DAO
// (fromRow / fromEntity), así el service no arma objetos campo por campo.

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

  static fromRow(row: ReportRow): AdminReportDetailDto {
    return {
      id: row.id,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      resolvedAt: iso(row.resolved_at),
      resolutionNotes: row.resolution_notes,
      reporter: { id: row.reporter_id, email: row.reporter_email, name: row.reporter_name },
      target: {
        type: row.target_type,
        id: row.target_id,
        authorId: row.author_id,
        authorName: row.author_name,
        authorStatus: row.author_status,
        content: row.content,
        currentStatus: row.current_status,
      },
    };
  }
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

  static fromRow(row: AppealRow): AdminAppealDetailDto {
    return {
      id: row.id,
      moderationLogId: row.moderation_log_id,
      justification: row.justification,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      resolvedAt: iso(row.resolved_at),
      user: { id: row.user_id, name: row.user_name, email: row.user_email },
      content: {
        type: row.content_type,
        id: row.content_id,
        text: row.content,
        currentStatus: row.current_status,
        detectedWords: row.detected_words ?? [],
        moderatedAt: row.moderated_at.toISOString(),
      },
    };
  }
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

  static fromRow(row: UserRow): AdminUserListItemDto {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      isVerified: row.is_verified,
      suspensionReason: row.suspension_reason,
      createdAt: row.created_at.toISOString(),
    };
  }
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

  // PostgreSQL devuelve COUNT(*) como texto: se convierte a número
  static fromRow(row: StatsRow): AdminStatsDto {
    return {
      totalUsers: Number(row.total_users),
      totalActiveGroups: Number(row.total_active_groups),
      totalPosts: Number(row.total_posts),
      pendingReports: Number(row.pending_reports),
      pendingAppeals: Number(row.pending_appeals),
    };
  }
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

  static fromEntity(notification: NotificationEntity): NotificationDto {
    return {
      id: notification.id,
      userId: notification.userId,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}

export class MarkNotificationReadResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty() id!: string;
}
