import { Injectable } from '@nestjs/common';
import {
  ActiveGroupInfo,
  AutoGroupInput,
  GroupMessagingClient,
} from '../GroupMessagingClient';
import { GroupsRepository } from '../../../group-messaging/repositories/groups.repository';

@Injectable()
export class GroupMessagingClientImpl extends GroupMessagingClient {
  constructor(private readonly groupsRepository: GroupsRepository) {
    super();
  }

  async findActiveById(
    groupId: string,
    userId?: string,
  ): Promise<ActiveGroupInfo | null> {
    const group = await this.groupsRepository.findActiveById(groupId);
    if (!group) return null;

    let isMember: boolean | undefined;
    if (userId) {
      if (group.leaderId === userId) {
        isMember = true;
      } else {
        try {
          await this.groupsRepository.requireMember(groupId, userId);
          isMember = true;
        } catch {
          isMember = false;
        }
      }
    }

    return {
      id: group.id,
      leaderId: group.leaderId,
      groupType: group.groupType,
      maxCapacity: group.maxCapacity,
      isMember,
    };
  }

  async createAutoGroup(input: AutoGroupInput, userId: string): Promise<string> {
    const group = await this.groupsRepository.createWithLeader(
      {
        name: input.name,
        description: input.description ?? null,
        benefits: input.benefits ?? null,
        requirements: input.requirements ?? null,
        courseCode: input.courseCode,
        meetingMode: input.meetingMode,
        meetingShift: input.meetingShift,
        maxCapacity: input.maxCapacity,
      },
      userId,
    );
    return group.id;
  }

  async createTutoringRoom(
    tutorId: string,
    requesterId: string,
    name: string,
    description?: string | null,
  ): Promise<string> {
    return this.groupsRepository.createTutoringRoom(
      tutorId,
      requesterId,
      name,
      description,
    );
  }
}
