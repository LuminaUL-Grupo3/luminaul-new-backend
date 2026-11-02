import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AuthModule } from "../../auth/auth.module";
import { GroupEntity } from "./entities/group.entity";
import { GroupMemberEntity } from "./entities/group-member.entity";
import { GroupMessageEntity } from "./entities/group-message.entity";
import { JoinRequestEntity } from "./entities/join-request.entity";
import { GroupsRepository } from "./repositories/groups.repository";
import { MessagesRepository } from "./repositories/messages.repository";
import { GroupMessagingService } from "./group-messaging.service";
import {
  GroupMessagingController,
  LegacyRequestsController,
} from "./group-messaging.controller";
import { GroupSession, GroupSessionGuard } from "./security/group-session";
import { ChatGateway } from "./gateways/chat.gateway";
import { RoomPresence } from "./gateways/room-presence";

/** Punto de composición de SPEC-04; reutiliza sesiones y publica eventos para moderación. */
@Module({
  imports: [
    AuthModule,
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      GroupMessageEntity,
      JoinRequestEntity,
    ]),
  ],
  controllers: [GroupMessagingController, LegacyRequestsController],
  providers: [
    GroupsRepository,
    MessagesRepository,
    GroupMessagingService,
    GroupSession,
    GroupSessionGuard,
    ChatGateway,
    RoomPresence,
  ],
  exports: [GroupMessagingService],
})
export class GroupMessagingModule {}
