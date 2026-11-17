import { HttpStatus } from '@nestjs/common';
import { type Mocked } from 'vitest';
import { AdminRepository, UserRecord } from '../repository/AdminRepository';
import { NotificationClient } from '../client/NotificationClient';
import { NotificationSendEvent } from '../events/notification-send.event';
import { SuspendUserStrategy } from '../strategy/impl/SuspendUserStrategy';
import { ReactivateUserStrategy } from '../strategy/impl/ReactivateUserStrategy';
import { ManagedUserStatus, NotificationType } from '../enums/administration.enums';
import { AdminException } from '../exception/AdminException';
import { ADMIN_MESSAGES, AuditAction, NOTICES } from '../administration.constants';
import { UserAccountStatus } from '../../auth-security/enums/UserAccountStatus';
import { UserRole } from '../../auth-security/enums/UserRole';

// Pruebas unitarias de las estrategias de la HU 7.1 (patrón Strategy).
//
// Clases y casos:
//   SuspendUserStrategy.execute     éxito: responde que la cuenta quedó suspendida y guarda el
//                                          estado, el motivo y la auditoría. No notifica: el alumno
//                                          suspendido ya no puede entrar a ver el aviso.
//                                   error: la cuenta cambió en paralelo (el repositorio no la
//                                          actualiza) y falla el guardado.
//   ReactivateUserStrategy.execute  éxito: guarda la cuenta activa con la auditoría y, después de
//                                          guardar, avisa al alumno con la notificación.
//                                   error: la cuenta cambió en paralelo y falla el guardado; en
//                                          los dos casos no se avisa al alumno.
//
// Las dependencias son abstracciones (AdminRepository y NotificationClient) y se reemplazan por
// dobles de prueba: ninguna prueba usa PostgreSQL ni el bus de eventos.
// Estructura de cada prueba: preparar (Arrange), ejecutar (Act) y comprobar (Assert).

const ADMIN_ID = '99887766-5544-4322-8100-aabbccddeeff';
const STUDENT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const REASON = 'Spam o publicidad no solicitada. Publicó enlaces en 5 grupos';

function buildUser(status: UserAccountStatus): UserRecord {
  return {
    id: STUDENT_ID,
    email: '20210001@aloe.ulima.edu.pe',
    name: 'Martín Vizcarra',
    role: UserRole.STUDENT,
    status,
  };
}

// Doble de prueba del Adapter NotificationClient: guarda los avisos en una lista
class RecordingNotificationClient extends NotificationClient {
  readonly sent: NotificationSendEvent[] = [];

  notify(notice: NotificationSendEvent): void {
    this.sent.push(notice);
  }
}

describe('HU 7.1 Estrategias de cambio de estado de cuenta (unitaria)', () => {
  let repository: Mocked<AdminRepository>;
  let notifications: RecordingNotificationClient;

  beforeEach(() => {
    // Mock del DAO (como mock() de Mockito): solo se simula el método que usan las estrategias
    repository = {
      changeUserStatus: vi.fn().mockResolvedValue(true),
    } as unknown as Mocked<AdminRepository>;
    notifications = new RecordingNotificationClient();
  });

  describe('SuspendUserStrategy.execute', () => {
    let strategy: SuspendUserStrategy;

    beforeEach(() => {
      strategy = new SuspendUserStrategy(repository);
    });

    it('éxito · alumno activo: responde que la cuenta quedó suspendida y las sesiones revocadas', async () => {
      // Arrange
      const user = buildUser(UserAccountStatus.ACTIVE);

      // Act
      const result = await strategy.execute({ adminId: ADMIN_ID, user, reason: REASON });

      // Assert
      expect(result).toEqual({
        message: ADMIN_MESSAGES.USER_SUSPENDED,
        userId: STUDENT_ID,
        status: ManagedUserStatus.SUSPENDED,
      });
      expect(repository.changeUserStatus).toHaveBeenCalledTimes(1);
    });

    it('éxito · guarda el estado suspended, el motivo y la auditoría con el estado anterior', async () => {
      // Arrange
      const user = buildUser(UserAccountStatus.ACTIVE);

      // Act
      await strategy.execute({ adminId: ADMIN_ID, user, reason: REASON });

      // Assert
      expect(repository.changeUserStatus).toHaveBeenCalledWith({
        userId: STUDENT_ID,
        adminId: ADMIN_ID,
        status: ManagedUserStatus.SUSPENDED,
        reason: REASON,
        audit: {
          action: AuditAction.USER_SUSPENDED,
          details: { reason: REASON, previousStatus: UserAccountStatus.ACTIVE },
        },
      });
    });

    it('error · otro administrador cambió la cuenta en paralelo: 409 "ya se encuentra suspendido"', async () => {
      // Arrange: el repositorio no actualiza ninguna fila
      repository.changeUserStatus.mockResolvedValue(false);
      const user = buildUser(UserAccountStatus.ACTIVE);

      // Act
      const result = strategy.execute({ adminId: ADMIN_ID, user, reason: REASON });

      // Assert
      await expect(result).rejects.toThrow(
        new AdminException(ADMIN_MESSAGES.USER_ALREADY_SUSPENDED, HttpStatus.CONFLICT),
      );
      await expect(result).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('error · falla el guardado: el error se propaga y no se responde como suspendida', async () => {
      // Arrange
      repository.changeUserStatus.mockRejectedValue(new Error('conexión perdida'));
      const user = buildUser(UserAccountStatus.ACTIVE);

      // Act
      const result = strategy.execute({ adminId: ADMIN_ID, user, reason: REASON });

      // Assert
      await expect(result).rejects.toThrow('conexión perdida');
    });
  });

  describe('ReactivateUserStrategy.execute', () => {
    let strategy: ReactivateUserStrategy;

    beforeEach(() => {
      strategy = new ReactivateUserStrategy(repository, notifications);
    });

    it('éxito · alumno suspendido: guarda la cuenta activa con la auditoría', async () => {
      // Arrange
      const user = buildUser(UserAccountStatus.SUSPENDED);

      // Act
      const result = await strategy.execute({ adminId: ADMIN_ID, user, reason: 'Apelación aceptada' });

      // Assert
      expect(result).toEqual({
        message: ADMIN_MESSAGES.USER_ACTIVATED,
        userId: STUDENT_ID,
        status: ManagedUserStatus.ACTIVE,
      });
      expect(repository.changeUserStatus).toHaveBeenCalledWith({
        userId: STUDENT_ID,
        adminId: ADMIN_ID,
        status: ManagedUserStatus.ACTIVE,
        reason: 'Apelación aceptada',
        audit: {
          action: AuditAction.USER_ACTIVATED,
          details: { reason: 'Apelación aceptada', previousStatus: UserAccountStatus.SUSPENDED },
        },
      });
    });

    it('éxito · avisa al alumno con la notificación "Cuenta reactivada" después de guardar', async () => {
      // Arrange: se anota si el aviso llega cuando el guardado ya terminó
      let savedBeforeNotice = false;
      repository.changeUserStatus.mockImplementation(async () => {
        savedBeforeNotice = notifications.sent.length === 0;
        return true;
      });
      const user = buildUser(UserAccountStatus.SUSPENDED);

      // Act
      await strategy.execute({ adminId: ADMIN_ID, user, reason: 'Apelación aceptada' });

      // Assert
      expect(notifications.sent).toEqual([
        {
          userId: STUDENT_ID,
          title: NOTICES.ACCOUNT_REACTIVATED.title,
          message: NOTICES.ACCOUNT_REACTIVATED.message,
          type: NotificationType.SYSTEM,
        },
      ]);
      expect(savedBeforeNotice).toBe(true);
    });

    it('error · otro administrador cambió la cuenta en paralelo: 409 "ya se encuentra activo" y no avisa', async () => {
      // Arrange
      repository.changeUserStatus.mockResolvedValue(false);
      const user = buildUser(UserAccountStatus.SUSPENDED);

      // Act
      const result = strategy.execute({ adminId: ADMIN_ID, user, reason: 'Apelación aceptada' });

      // Assert
      await expect(result).rejects.toThrow(
        new AdminException(ADMIN_MESSAGES.USER_ALREADY_ACTIVE, HttpStatus.CONFLICT),
      );
      expect(notifications.sent).toHaveLength(0);
    });

    it('error · falla el guardado: el error se propaga y no se avisa al alumno', async () => {
      // Arrange
      repository.changeUserStatus.mockRejectedValue(new Error('conexión perdida'));
      const user = buildUser(UserAccountStatus.SUSPENDED);

      // Act
      const result = strategy.execute({ adminId: ADMIN_ID, user, reason: 'Apelación aceptada' });

      // Assert
      await expect(result).rejects.toThrow('conexión perdida');
      expect(notifications.sent).toHaveLength(0);
    });
  });
});
