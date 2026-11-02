import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupEntity } from './entities/group.entity';
import { GroupMemberEntity } from './entities/group-member.entity';
import { GroupMessageEntity } from './entities/group-message.entity';
import { GroupsRepository } from './groups.repository';
import { GroupsService } from './groups.service';
import { JoinRequestEntity } from '../join-requests/entities/join-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      GroupMessageEntity,
      JoinRequestEntity,
    ]),
  ],
  // Integración SPEC-04: las rutas las registra GroupMessagingModule; Posts conserva este DAO heredado.
  controllers: [],
  providers: [GroupsRepository, GroupsService],
  exports: [TypeOrmModule, GroupsRepository],
})
export class GroupsModule {}
