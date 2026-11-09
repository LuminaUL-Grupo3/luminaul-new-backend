import { Injectable } from '@nestjs/common';
import { UserStatusChange, UserStatusChangeStrategy } from '../UserStatusChangeStrategy';
import { AdminRepository } from '../../repository/AdminRepository';
import { NotificationClient } from '../../client/NotificationClient';
import { ChangeUserStatusResponseDto } from '../../dto/admin-response.dto';
import { ManagedUserStatus, NotificationType } from '../../enums/administration.enums';
import { ADMIN_MESSAGES, AuditAction, NOTICES } from '../../administration.constants';

/**
 * Estrategia concreta (HU 7.1): reactivar una cuenta suspendida.
 *
 * El DAO guarda status = 'active' y borra el motivo de suspensión. Después se avisa al
 * alumno con la notificación "Cuenta reactivada" a través del Adapter NotificationClient.
 */
@Injectable()
export class ReactivateUserStrategy extends UserStatusChangeStrategy {
  readonly targetStatus = ManagedUserStatus.ACTIVE;
  readonly alreadyInStatusMessage = ADMIN_MESSAGES.USER_ALREADY_ACTIVE;

  constructor(
    repository: AdminRepository,
    private readonly notificationClient: NotificationClient,
  ) {
    super(repository);
  }

  async execute(change: UserStatusChange): Promise<ChangeUserStatusResponseDto> {
    await this.saveStatus(change, AuditAction.USER_ACTIVATED);
    this.notificationClient.notify({
      userId: change.user.id,
      ...NOTICES.ACCOUNT_REACTIVATED,
      type: NotificationType.SYSTEM,
    });
    return {
      message: ADMIN_MESSAGES.USER_ACTIVATED,
      userId: change.user.id,
      status: this.targetStatus,
    };
  }
}
