import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AdminRepository, UserRecord } from '../repository/AdminRepository';
import { NotificationClient } from '../client/NotificationClient';
import { NotificationClientImpl } from '../client/impl/NotificationClientImpl';
import { ChatClientImpl } from '../client/impl/ChatClientImpl';
import { buildStatusStrategies } from '../strategy/UserStatusChangeStrategy';
import { SuspendUserStrategy } from '../strategy/impl/SuspendUserStrategy';
import { ReactivateUserStrategy } from '../strategy/impl/ReactivateUserStrategy';
import { AdminException } from '../exception/AdminException';
import { ManagedUserStatus, NotificationType } from '../enums/administration.enums';
import {
  ADMIN_MESSAGES,
  AuditAction,
  CONTENT_VISIBILITY_CHANGED_EVENT,
  NOTIFICATION_SEND_EVENT,
} from '../administration.constants';

// Pruebas de los patrones del refactor de SPEC-07: Strategy (HU 7.1) y Adapter.

const ADMIN = '99887766-5544-4322-8100-aabbccddeeff';
const STUDENT: UserRecord = {
  id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  email: '20210001@aloe.ulima.edu.pe',
  name: 'Martín Vizcarra',
  role: 'student',
  status: 'active',
};

describe('SPEC-07: patrones del curso', () => {
  let changeUserStatus: Mock<(...args: unknown[]) => Promise<boolean>>;
  let repository: AdminRepository;
  let notify: Mock<(...args: unknown[]) => void>;
  let notificationClient: NotificationClient;

  beforeEach(() => {
    changeUserStatus = vi.fn<(...args: unknown[]) => Promise<boolean>>().mockResolvedValue(true);
    repository = { changeUserStatus } as unknown as AdminRepository;
    notify = vi.fn<(...args: unknown[]) => void>();
    notificationClient = { notify } as unknown as NotificationClient;
  });

  describe('Strategy: SuspendUserStrategy (HU 7.1-E1)', () => {
    it('guarda el estado suspended con su auditoría y no notifica', async () => {
      const strategy = new SuspendUserStrategy(repository);
      const result = await strategy.execute({ adminId: ADMIN, user: STUDENT, reason: 'Spam' });

      expect(changeUserStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: STUDENT.id,
          adminId: ADMIN,
          status: ManagedUserStatus.SUSPENDED,
          reason: 'Spam',
          audit: expect.objectContaining({ action: AuditAction.USER_SUSPENDED }),
        }),
      );
      expect(result).toEqual({
        message: ADMIN_MESSAGES.USER_SUSPENDED,
        userId: STUDENT.id,
        status: ManagedUserStatus.SUSPENDED,
      });
    });

    it('409 si otro administrador cambió la cuenta en paralelo (el DAO no afectó filas)', async () => {
      changeUserStatus.mockResolvedValue(false);
      const strategy = new SuspendUserStrategy(repository);

      const error = await strategy
        .execute({ adminId: ADMIN, user: STUDENT, reason: 'Spam' })
        .then(() => null, (reason: unknown) => reason);
      expect(error).toBeInstanceOf(AdminException);
      expect((error as AdminException).getStatus()).toBe(409);
      expect((error as AdminException).message).toBe(ADMIN_MESSAGES.USER_ALREADY_SUSPENDED);
    });
  });

  describe('Strategy: ReactivateUserStrategy (HU 7.1-E4 propuesto)', () => {
    it('guarda el estado active y avisa al alumno por el Adapter', async () => {
      const strategy = new ReactivateUserStrategy(repository, notificationClient);
      const suspended = { ...STUDENT, status: 'suspended' };
      const result = await strategy.execute({ adminId: ADMIN, user: suspended, reason: 'Fin' });

      expect(changeUserStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ManagedUserStatus.ACTIVE,
          audit: expect.objectContaining({ action: AuditAction.USER_ACTIVATED }),
        }),
      );
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: STUDENT.id, type: NotificationType.SYSTEM }),
      );
      expect(result.message).toBe(ADMIN_MESSAGES.USER_ACTIVATED);
    });
  });

  describe('Strategy: registro en el módulo (OCP)', () => {
    it('el factory provider arma el mapa "estado pedido → estrategia"', () => {
      const suspend = new SuspendUserStrategy(repository);
      const reactivate = new ReactivateUserStrategy(repository, notificationClient);
      const strategies = buildStatusStrategies(suspend, reactivate);

      expect(strategies[ManagedUserStatus.SUSPENDED]).toBe(suspend);
      expect(strategies[ManagedUserStatus.ACTIVE]).toBe(reactivate);
    });
  });

  describe('Adapter: clientes sobre EventEmitter2', () => {
    let emit: Mock<(...args: unknown[]) => boolean>;
    let emitter: EventEmitter2;

    beforeEach(() => {
      emit = vi.fn<(...args: unknown[]) => boolean>();
      emitter = { emit } as unknown as EventEmitter2;
    });

    it('NotificationClientImpl traduce notify() al evento notification.send', () => {
      const notice = { userId: STUDENT.id, title: 't', message: 'm', type: NotificationType.MODERATION };
      new NotificationClientImpl(emitter).notify(notice);
      expect(emit).toHaveBeenCalledWith(NOTIFICATION_SEND_EVENT, notice);
    });

    it('ChatClientImpl traduce contentVisibilityChanged() al evento del chat', () => {
      new ChatClientImpl(emitter).contentVisibilityChanged('message', 'm1');
      expect(emit).toHaveBeenCalledWith(CONTENT_VISIBILITY_CHANGED_EVENT, {
        contentType: 'message',
        contentId: 'm1',
      });
    });
  });
});
