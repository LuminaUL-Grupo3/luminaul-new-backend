import { Injectable } from '@nestjs/common';
import { GroupMessagingClient, AutoGroupInput } from '../GroupMessagingClient';
import { GroupsRepository } from '../../../group-messaging/repositories/groups.repository';

@Injectable()
export class GroupMessagingClientImpl extends GroupMessagingClient {
  constructor(private readonly groupsRepository: GroupsRepository) {
    super();
  }

  async findActiveById(groupId: string): Promise<{ id: string } | null> {
    const group = await this.groupsRepository.findActiveById(groupId);
    if (!group) return null;
    return { id: group.id };
  }

  async createAutoGroup(input: AutoGroupInput, userId: string): Promise<string> {
    const group = await this.groupsRepository.createWithAdmin(
      {
        name: input.name,
        description: input.description ?? null,
        benefits: input.benefits ?? null,
        requirements: input.requirements ?? null,
      },
      userId,
    );
    return group.id;
  }
}
