import { Injectable, NotFoundException } from '@nestjs/common';
import { GroupsRepository } from './groups.repository';
import { GroupEntity } from './entities/group.entity';
import {
  GroupDetailResponseDto,
  GroupMembershipStatus,
} from './dto/group-detail-response.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly groupsRepository: GroupsRepository) {}

  /**
   * H.U 2.1 — Detalle de un grupo y estado del usuario actual frente a él.
   *
   * 1. El grupo debe existir y no estar eliminado → 404
   * 2. Se calcula my_status: admin > member > pending > none
   */
  async getGroupDetail(groupId: string, userId: string): Promise<GroupDetailResponseDto> {
    const group = await this.groupsRepository.findDetailById(groupId);
    if (!group) {
      throw new NotFoundException('Grupo no encontrado o eliminado');
    }

    const myStatus = await this.resolveMembershipStatus(group, userId);
    return this.mapToDetailDto(group, myStatus);
  }

  private async resolveMembershipStatus(
    group: GroupEntity,
    userId: string,
  ): Promise<GroupMembershipStatus> {
    if (group.adminId === userId) {
      return 'admin';
    }
    const isMember = (group.members ?? []).some((member) => member.userId === userId);
    if (isMember) {
      return 'member';
    }
    const hasPending = await this.groupsRepository.hasPendingJoinRequest(group.id, userId);
    return hasPending ? 'pending' : 'none';
  }

  private mapToDetailDto(
    group: GroupEntity,
    myStatus: GroupMembershipStatus,
  ): GroupDetailResponseDto {
    const adminProfile = group.admin?.profile;
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      benefits: group.benefits,
      requirements: group.requirements,
      meeting_mode: group.meetingMode,
      meeting_shift: group.meetingShift,
      max_capacity: group.maxCapacity,
      member_count: group.members?.length ?? 0,
      admin_id: group.adminId,
      admin: {
        user_id: group.adminId,
        name: adminProfile?.name ?? '',
        profile_photo_url: adminProfile?.profilePhotoUrl ?? null,
      },
      my_status: myStatus,
      created_at: group.createdAt,
    };
  }
}
