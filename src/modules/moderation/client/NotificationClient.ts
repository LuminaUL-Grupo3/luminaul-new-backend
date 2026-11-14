export interface ModerationUserNotice {
  userId: string;
  title: string;
  message: string;
  type: 'MODERATION' | 'GROUP' | 'SYSTEM';
}

export type ModerationAdminNotice = Omit<ModerationUserNotice, 'userId'>;

/**
 * Puerto de notificaciones para SPEC-06; evita acoplar ModerationServiceImpl con EventEmitter2.
 */
export abstract class NotificationClient {
  abstract notifyUser(notice: ModerationUserNotice): void;
  abstract notifyAdministrators(notice: ModerationAdminNotice): void;
}

