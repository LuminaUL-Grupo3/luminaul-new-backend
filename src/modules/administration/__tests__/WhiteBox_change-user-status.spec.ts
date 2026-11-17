import { HttpStatus } from '@nestjs/common';
import { type Mocked } from 'vitest';
import { AdminServiceImpl } from '../service/impl/AdminServiceImpl';
import { AdminRepository, UserRecord } from '../repository/AdminRepository';
import { NotificationClient } from '../client/NotificationClient';
import { ChatClient } from '../client/ChatClient';
import { NotificationSendEvent } from '../events/notification-send.event';
import { buildStatusStrategies } from '../strategy/UserStatusChangeStrategy';
import { SuspendUserStrategy } from '../strategy/impl/SuspendUserStrategy';
import { ReactivateUserStrategy } from '../strategy/impl/ReactivateUserStrategy';
import { ChangeUserStatusDto } from '../dto/admin-request.dto';
import { ManagedUserStatus } from '../enums/administration.enums';
import { AdminException } from '../exception/AdminException';
import { ADMIN_MESSAGES } from '../administration.constants';
import { UserAccountStatus } from '../../auth-security/enums/UserAccountStatus';
import { UserRole } from '../../auth-security/enums/UserRole';

// Prueba de caja blanca de la HU 7.1 (suspender cuenta): AdminServiceImpl.validateStatusChange (V(G) = 7).
//
// validateStatusChange es privado, así que se ejecuta a través del método público
// changeUserStatus. changeUserStatus no tiene decisiones propias: el Strategy elige la clase
// según el estado pedido (statusStrategies[dto.status]) sin if/else.
//
// Decisiones del método:
//   D1   if (adminId === userId)
//   D2   if (!user || user.status === DELETED)
//          D2a  !user
//          D2b  user.status === DELETED          (solo se evalúa si D2a es falsa)
//   D3   if (user.role === ADMIN)
//   D4   if (user.status === PENDING_VERIFICATION)
//   D5   if (user.status === strategy.targetStatus)
//
// V(G) = decisiones + 1 = 6 + 1 = 7 (D1, D2a, D2b, D3, D4 y D5).
//
// Caminos independientes (uno por caso) y ramas que cubre cada uno:
//   C1  D1 V                                     -> 400 CANNOT_CHANGE_OWN_STATUS
//   C2  D1 F, D2a V                              -> 404 USER_NOT_FOUND
//   C3  D1 F, D2a F, D2b V                       -> 404 USER_NOT_FOUND (cuenta eliminada)
//   C4  D1 F, D2 F, D3 V                         -> 403 CANNOT_SUSPEND_ADMIN
//   C5  D1 F, D2 F, D3 F, D4 V                   -> 409 USER_NOT_VERIFIED
//   C6  D1 F, D2 F, D3 F, D4 F, D5 V             -> 409 USER_ALREADY_SUSPENDED
//   C7  D1 F, D2 F, D3 F, D4 F, D5 F             -> 200, la estrategia suspende la cuenta
// Con C1..C7 cada decisión (incluidos los dos operandos del ||) toma los valores verdadero y
// falso, es decir, 100 % de cobertura de ramas de validateStatusChange.

const ADMIN_ID = '99887766-5544-4322-8100-aabbccddeeff';
const STUDENT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const REASON = 'Lenguaje ofensivo o insultos';

function buildUser(status: UserAccountStatus, role: UserRole = UserRole.STUDENT): UserRecord {
  return {
    id: STUDENT_ID,
    email: '20210001@aloe.ulima.edu.pe',
    name: 'Martín Vizcarra',
    role,
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

// Doble de prueba del Adapter ChatClient: la HU 7.1 no lo usa
class UnusedChatClient extends ChatClient {
  contentVisibilityChanged(): void {
    throw new Error('La HU 7.1 no avisa al chat');
  }
}

describe('HU 7.1 AdminServiceImpl.validateStatusChange (caja blanca · V(G) = 7)', () => {
  let service: AdminServiceImpl;
  let repository: Mocked<AdminRepository>;
  let suspendStrategy: SuspendUserStrategy;

  beforeEach(() => {
    // Mock del DAO (como mock() de Mockito): solo se simulan los 2 métodos que usa la HU 7.1
    repository = {
      findUserById: vi.fn(),
      changeUserStatus: vi.fn().mockResolvedValue(true),
    } as unknown as Mocked<AdminRepository>;

    // Las estrategias son las reales; solo su repositorio es simulado
    suspendStrategy = new SuspendUserStrategy(repository);
    const reactivateStrategy = new ReactivateUserStrategy(repository, new RecordingNotificationClient());

    service = new AdminServiceImpl(
      repository,
      new RecordingNotificationClient(),
      new UnusedChatClient(),
      buildStatusStrategies(suspendStrategy, reactivateStrategy),
    );
  });

  function suspendDto(): ChangeUserStatusDto {
    return Object.assign(new ChangeUserStatusDto(), {
      status: ManagedUserStatus.SUSPENDED,
      reason: REASON,
    });
  }

  // Comprueba que changeUserStatus termine en la salida de error esperada sin guardar nada
  async function expectRejectedWithoutChanges(
    adminId: string,
    message: string,
    status: HttpStatus,
  ): Promise<void> {
    const result = service.changeUserStatus(adminId, STUDENT_ID, suspendDto());
    await expect(result).rejects.toThrow(new AdminException(message, status));
    await expect(result).rejects.toMatchObject({ status });
    expect(repository.changeUserStatus).not.toHaveBeenCalled();
  }

  it('C1 · D1 verdadera: el administrador intenta cambiar el estado de su propia cuenta', async () => {
    await expectRejectedWithoutChanges(
      STUDENT_ID,
      ADMIN_MESSAGES.CANNOT_CHANGE_OWN_STATUS,
      HttpStatus.BAD_REQUEST,
    );
    // D1 corta antes de consultar la base de datos
    expect(repository.findUserById).not.toHaveBeenCalled();
  });

  it('C2 · D2a verdadera: la cuenta no existe', async () => {
    repository.findUserById.mockResolvedValue(null);

    await expectRejectedWithoutChanges(ADMIN_ID, ADMIN_MESSAGES.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    expect(repository.findUserById).toHaveBeenCalledWith(STUDENT_ID);
  });

  it('C3 · D2a falsa y D2b verdadera: la cuenta está eliminada', async () => {
    repository.findUserById.mockResolvedValue(buildUser(UserAccountStatus.DELETED));

    await expectRejectedWithoutChanges(ADMIN_ID, ADMIN_MESSAGES.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
  });

  it('C4 · D3 verdadera: la cuenta es de otro administrador', async () => {
    repository.findUserById.mockResolvedValue(buildUser(UserAccountStatus.ACTIVE, UserRole.ADMIN));

    await expectRejectedWithoutChanges(
      ADMIN_ID,
      ADMIN_MESSAGES.CANNOT_SUSPEND_ADMIN,
      HttpStatus.FORBIDDEN,
    );
  });

  it('C5 · D4 verdadera: la cuenta todavía no fue verificada por el alumno', async () => {
    repository.findUserById.mockResolvedValue(buildUser(UserAccountStatus.PENDING_VERIFICATION));

    await expectRejectedWithoutChanges(ADMIN_ID, ADMIN_MESSAGES.USER_NOT_VERIFIED, HttpStatus.CONFLICT);
  });

  it('C6 · D5 verdadera: la cuenta ya está suspendida', async () => {
    repository.findUserById.mockResolvedValue(buildUser(UserAccountStatus.SUSPENDED));

    await expectRejectedWithoutChanges(
      ADMIN_ID,
      ADMIN_MESSAGES.USER_ALREADY_SUSPENDED,
      HttpStatus.CONFLICT,
    );
  });

  it('C7 · todas las decisiones falsas: la estrategia suspende la cuenta del alumno activo', async () => {
    const user = buildUser(UserAccountStatus.ACTIVE);
    repository.findUserById.mockResolvedValue(user);
    const execute = vi.spyOn(suspendStrategy, 'execute');

    const result = await service.changeUserStatus(ADMIN_ID, STUDENT_ID, suspendDto());

    expect(result).toEqual({
      message: ADMIN_MESSAGES.USER_SUSPENDED,
      userId: STUDENT_ID,
      status: ManagedUserStatus.SUSPENDED,
    });
    // validateStatusChange devuelve la cuenta y el service se la pasa a la estrategia elegida
    expect(execute).toHaveBeenCalledWith({ adminId: ADMIN_ID, user, reason: REASON });
    expect(repository.changeUserStatus).toHaveBeenCalledTimes(1);
  });
});
