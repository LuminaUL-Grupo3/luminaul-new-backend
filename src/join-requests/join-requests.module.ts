import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JoinRequestEntity } from './entities/join-request.entity';
import { GroupMemberEntity } from '../groups/entities/group-member.entity';
import { GroupEntity } from '../groups/entities/group.entity';
import { JoinRequestsController } from './join-requests.controller';
import { JoinRequestsService } from './join-requests.service';
import { JoinRequestsRepository } from './join-requests.repository';

import { GroupsModule } from '../groups/groups.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JoinRequestEntity,
      GroupMemberEntity,
      GroupEntity,
    ]),
    GroupsModule,
  ],
  controllers: [JoinRequestsController],
  providers: [JoinRequestsService, JoinRequestsRepository],
  exports: [JoinRequestsService, JoinRequestsRepository],
})
export class JoinRequestsModule {}
