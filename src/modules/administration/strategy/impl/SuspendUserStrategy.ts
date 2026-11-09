import { Injectable } from '@nestjs/common';
import { UserStatusChange, UserStatusChangeStrategy } from '../UserStatusChangeStrategy';
import { AdminRepository } from '../../repository/AdminRepository';
import { ChangeUserStatusResponseDto } from '../../dto/admin-response.dto';
import { ManagedUserStatus } from '../../enums/administration.enums';
import { ADMIN_MESSAGES, AuditAction } from '../../administration.constants';

/**
 * Estrategia concreta (HU 7.1, criterio E1): suspender una cuenta.
 *
 * El DAO guarda status = 'suspended', el motivo y tokens_valid_after = NOW(). Con eso el
 * JwtAuthGuard de SPEC-01 rechaza al instante cualquier sesión abierta del alumno, y el
 * login responde "Tu cuenta ha sido suspendida por infringir las normas comunitarias"
 * (criterio E2). No se envía notificación: el alumno suspendido no puede entrar a verla.
 */
@Injectable()
export class SuspendUserStrategy extends UserStatusChangeStrategy {
  readonly targetStatus = ManagedUserStatus.SUSPENDED;
  readonly alreadyInStatusMessage = ADMIN_MESSAGES.USER_ALREADY_SUSPENDED;

  constructor(repository: AdminRepository) {
    super(repository);
  }

  async execute(change: UserStatusChange): Promise<ChangeUserStatusResponseDto> {
    await this.saveStatus(change, AuditAction.USER_SUSPENDED);
    return {
      message: ADMIN_MESSAGES.USER_SUSPENDED,
      userId: change.user.id,
      status: this.targetStatus,
    };
  }
}
