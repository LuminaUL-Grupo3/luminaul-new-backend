import { HttpStatus } from '@nestjs/common';
import { AdminRepository, UserRecord } from '../repository/AdminRepository';
import { ChangeUserStatusResponseDto } from '../dto/admin-response.dto';
import { ManagedUserStatus } from '../enums/administration.enums';
import { AuditAction } from '../administration.constants';
import { AdminException } from '../exception/AdminException';

// Datos que recibe cada estrategia cuando el service ya validó la operación
export interface UserStatusChange {
  adminId: string;
  user: UserRecord;
  reason: string;
}

/**
 * Patrón Strategy (HU 7.1): "cambiar el estado de una cuenta" tiene variantes que se
 * comportan distinto. Cada variante es una clase (como EnvioEstandar / EnvioExpress del
 * profesor):
 *   - SuspendUserStrategy: suspende y cierra las sesiones activas.
 *   - ReactivateUserStrategy: reactiva y avisa al alumno con una notificación.
 *
 * AdminServiceImpl elige la estrategia según el estado pedido, sin if/else. Agregar una
 * variante nueva (por ejemplo, una suspensión temporal) es crear otra clase y registrarla
 * en el módulo, sin modificar el service: principio Abierto/Cerrado (OCP).
 */
export abstract class UserStatusChangeStrategy {
  constructor(protected readonly repository: AdminRepository) {}

  // Estado en el que queda la cuenta con esta estrategia
  abstract readonly targetStatus: ManagedUserStatus;

  // Mensaje si la cuenta ya estaba en ese estado (409)
  abstract readonly alreadyInStatusMessage: string;

  abstract execute(change: UserStatusChange): Promise<ChangeUserStatusResponseDto>;

  // Guarda el cambio de estado y su auditoría en una sola transacción (lo hace el DAO).
  // Si otro administrador cambió la cuenta en paralelo, no se afecta ninguna fila: 409.
  protected async saveStatus(change: UserStatusChange, action: AuditAction): Promise<void> {
    const saved = await this.repository.changeUserStatus({
      userId: change.user.id,
      adminId: change.adminId,
      status: this.targetStatus,
      reason: change.reason,
      audit: { action, details: { reason: change.reason, previousStatus: change.user.status } },
    });
    if (!saved) {
      throw new AdminException(this.alreadyInStatusMessage, HttpStatus.CONFLICT);
    }
  }
}

// Arma el mapa "estado pedido → estrategia" que recibe AdminServiceImpl. Lo usa el factory
// provider de AdministrationModule: una estrategia nueva solo se agrega a la lista (OCP).
export const buildStatusStrategies = (
  ...strategies: UserStatusChangeStrategy[]
): Record<ManagedUserStatus, UserStatusChangeStrategy> =>
  Object.fromEntries(
    strategies.map((strategy) => [strategy.targetStatus, strategy]),
  ) as Record<ManagedUserStatus, UserStatusChangeStrategy>;
