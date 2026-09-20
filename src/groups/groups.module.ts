import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupEntity } from './entities/group.entity';
import { GroupMemberEntity } from './entities/group-member.entity';
import { GroupMessageEntity } from './entities/group-message.entity';
import { GroupsRepository } from './groups.repository';

@Module({
  imports: [TypeOrmModule.forFeature([GroupEntity, GroupMemberEntity, GroupMessageEntity])],
  providers: [GroupsRepository],
  exports: [TypeOrmModule, GroupsRepository],
})
export class GroupsModule {}
