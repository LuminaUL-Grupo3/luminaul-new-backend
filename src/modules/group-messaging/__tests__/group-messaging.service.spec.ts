import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupMessagingService } from '../group-messaging.service';
import { GroupsRepository } from '../repositories/groups.repository';
import { MessagesRepository } from '../repositories/messages.repository';
import { GroupDetailDto } from '../types/messaging.types';

describe('GroupMessagingService (Unit)', () => {
  let service: GroupMessagingService;
  let mockGroupsRepo: jest.Mocked<GroupsRepository>;
  let mockMessagesRepo: jest.Mocked<MessagesRepository>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;

  const leaderId = 'user-uuid-leader';
  const applicantId = 'user-uuid-applicant';
  const groupId = 'group-uuid-1';
  const requestId = 'req-uuid-1';

  beforeEach(() => {
    mockGroupsRepo = {
      list: jest.fn(),
      detail: jest.fn(),
      members: jest.fn(),
      create: jest.fn(),
      requestJoin: jest.fn(),
      requests: jest.fn(),
      decide: jest.fn(),
      removeMember: jest.fn(),
      transfer: jest.fn(),
      requestGroup: jest.fn(),
      findActiveById: jest.fn(),
      createWithAdmin: jest.fn(),
    } as unknown as jest.Mocked<GroupsRepository>;

    mockMessagesRepo = {
      insert: jest.fn(),
      history: jest.fn(),
      toggleReaction: jest.fn(),
      markRead: jest.fn(),
    } as unknown as jest.Mocked<MessagesRepository>;

    mockEventEmitter = {
      emit: jest.fn(),
      emitAsync: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EventEmitter2>;

    service = new GroupMessagingService(
      mockGroupsRepo,
      mockMessagesRepo,
      mockEventEmitter,
    );
  });

  describe('create', () => {
    it('debe crear un grupo y retornar su detalle completo (Happy Path)', async () => {
      mockGroupsRepo.create.mockResolvedValue(groupId);
      const fakeDetail: Partial<GroupDetailDto> = {
        id: groupId,
        name: 'Grupo de Estudio de Prueba',
        courseCode: 'CS001',
        leaderId,
        maxCapacity: 6,
        currentMembers: 1,
        myRole: 'leader',
        myStatus: 'active',
      };
      mockGroupsRepo.detail.mockResolvedValue(fakeDetail as GroupDetailDto);

      const result = await service.create(leaderId, {
        name: 'Grupo de Estudio de Prueba',
        courseCode: 'CS001',
        meetingMode: 'virtual',
        meetingShift: 'manana',
        maxCapacity: 6,
      });

      expect(mockGroupsRepo.create).toHaveBeenCalledWith(
        leaderId,
        expect.objectContaining({ name: 'Grupo de Estudio de Prueba' }),
      );
      expect(mockGroupsRepo.detail).toHaveBeenCalledWith(groupId, leaderId);
      expect(result.id).toBe(groupId);
    });
  });

  describe('requestJoin', () => {
    it('debe registrar solicitud de ingreso y retornar status pending (Happy Path)', async () => {
      mockGroupsRepo.requestJoin.mockResolvedValue(requestId);

      const result = await service.requestJoin(groupId, applicantId, 'Deseo unirme al grupo');

      expect(mockGroupsRepo.requestJoin).toHaveBeenCalledWith(
        groupId,
        applicantId,
        'Deseo unirme al grupo',
      );
      expect(result).toEqual({
        id: requestId,
        status: 'pending',
        message: 'Solicitud enviada con éxito.',
      });
    });
  });

  describe('decide', () => {
    it('debe aprobar solicitud y emitir evento group.changed', async () => {
      mockGroupsRepo.decide.mockResolvedValue(undefined);

      const result = await service.decide(groupId, requestId, leaderId, 'approved');

      expect(mockGroupsRepo.decide).toHaveBeenCalledWith(
        groupId,
        requestId,
        leaderId,
        'approved',
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('group.changed', { groupId });
      expect(result.message).toBe('Solicitud aceptada correctamente.');
    });

    it('debe rechazar solicitud y emitir evento group.changed', async () => {
      mockGroupsRepo.decide.mockResolvedValue(undefined);

      const result = await service.decide(groupId, requestId, leaderId, 'rejected');

      expect(mockGroupsRepo.decide).toHaveBeenCalledWith(
        groupId,
        requestId,
        leaderId,
        'rejected',
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('group.changed', { groupId });
      expect(result.message).toBe('Solicitud rechazada correctamente.');
    });
  });

  describe('remove', () => {
    it('debe expulsar miembro y emitir group.member_removed asíncronamente', async () => {
      mockGroupsRepo.removeMember.mockResolvedValue(undefined);

      await service.remove(groupId, leaderId, applicantId, 'kicked');

      expect(mockGroupsRepo.removeMember).toHaveBeenCalledWith(
        groupId,
        leaderId,
        applicantId,
        'kicked',
      );
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'group.member_removed',
        expect.objectContaining({ groupId, userId: applicantId }),
      );
    });
  });
});
