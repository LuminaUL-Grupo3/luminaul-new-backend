import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { GroupMessagingService } from "./group-messaging.service";
import {
  GroupActor,
  GroupSessionGuard,
  PublicGroupRead,
} from "./security/group-session";
import { ChatIdentity, JoinRequestDto } from "./types/messaging.types";
import {
  CreateGroupDto,
  CreateJoinRequestDto,
  DecideJoinRequestDto,
  GroupFilterDto,
  MessageHistoryQueryDto,
  TransferLeadershipDto,
} from "./dto/group.dto";

/** Controlador del contrato SPEC-04; no accede directamente a TypeORM ni a SQL. */
@ApiTags("SPEC-04 Grupos y chat")
@ApiBearerAuth()
@UseGuards(GroupSessionGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@Controller("groups")
export class GroupMessagingController {
  constructor(private readonly service: GroupMessagingService) {}

  /** Directorio público filtrado, separado de la lista de grupos propios. */
  @Get()
  @PublicGroupRead()
  @ApiOperation({ summary: "Directorio de grupos activos" })
  directory(@GroupActor() user: ChatIdentity, @Query() query: GroupFilterDto) {
    return this.service.list(user.id, query);
  }

  /** Prioriza la ruta literal me sobre el identificador dinámico. */
  @Get("me")
  @ApiOperation({ summary: "Mis grupos activos, ordenados por actividad" })
  mine(@GroupActor() user: ChatIdentity, @Query() query: GroupFilterDto) {
    return this.service.list(user.id, query, true);
  }

  /** Consolida solicitudes de todos los grupos liderados sin consultar cuentas ajenas. */
  @Get("pending-requests")
  pending(@GroupActor() user: ChatIdentity) {
    return this.service.requests(user.id);
  }

  /** El líder se obtiene de la sesión, no de un campo enviado desde React. */
  @Post()
  @ApiOperation({ summary: "Crear grupo y membresía del líder" })
  create(@GroupActor() user: ChatIdentity, @Body() dto: CreateGroupDto) {
    return this.service.create(user.id, dto);
  }

  /** El detalle permite descubrir el grupo, pero no entrega contenido de la conversación a terceros. */
  @Get(":groupId")
  @PublicGroupRead()
  detail(
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @GroupActor() user: ChatIdentity,
  ) {
    return this.service.detail(groupId, user.id);
  }

  /** Lista participantes activos con roles de grupo leader/member. */
  @Get(":groupId/members")
  members(
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @GroupActor() user: ChatIdentity,
  ) {
    return this.service.members(groupId, user.id);
  }

  /** Consulta el historial cronológico de una conversación autorizada. */
  @Get(":groupId/messages")
  messages(
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @GroupActor() user: ChatIdentity,
    @Query() query: MessageHistoryQueryDto,
  ) {
    return this.service.history(groupId, user.id, query);
  }

  /** Envía una postulación opcional de hasta 255 caracteres. */
  @Post(":groupId/join-requests")
  requestJoin(
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @GroupActor() user: ChatIdentity,
    @Body() dto: CreateJoinRequestDto,
  ) {
    return this.service.requestJoin(groupId, user.id, dto.message);
  }

  /** Solo el líder recibe datos de postulantes y sus solicitudes pendientes. */
  @Get(":groupId/join-requests")
  requests(
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @GroupActor() user: ChatIdentity,
  ) {
    return this.service.requests(user.id, groupId);
  }

  /** La aprobación y la ocupación del cupo comparten una única transacción. */
  @Patch(":groupId/join-requests/:requestId")
  decide(
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @Param("requestId", new ParseUUIDPipe({ version: "4" })) requestId: string,
    @GroupActor() user: ChatIdentity,
    @Body() dto: DecideJoinRequestDto,
  ) {
    return this.service.decide(groupId, requestId, user.id, dto.status);
  }

  /** La ruta me se registra antes de :userId para evitar interpretarla como UUID. */
  @Delete(":groupId/members/me")
  leave(
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @GroupActor() user: ChatIdentity,
  ) {
    return this.service.remove(groupId, user.id, user.id, "left");
  }

  /** Conserva la pertenencia histórica del expulsado y revoca sus salas activas. */
  @Delete(":groupId/members/:userId")
  kick(
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @Param("userId", new ParseUUIDPipe({ version: "4" })) targetId: string,
    @GroupActor() user: ChatIdentity,
  ) {
    return this.service.remove(groupId, user.id, targetId, "kicked");
  }

  /** Hace posible que el líder transfiera el grupo antes de abandonar su membresía. */
  @Patch(":groupId/leader")
  transfer(
    @Param("groupId", new ParseUUIDPipe({ version: "4" })) groupId: string,
    @GroupActor() user: ChatIdentity,
    @Body() dto: TransferLeadershipDto,
  ) {
    return this.service.transfer(groupId, user.id, dto.userId);
  }
}

/** Contrato de compatibilidad de las pantallas de solicitudes que ya estaban publicadas. */
class LegacyDecisionDto {
  @IsIn(["accepted", "rejected"]) action!: "accepted" | "rejected";
}

/** Mantiene las dos rutas anteriores mientras el resto del equipo adopta el contrato nuevo. */
@ApiTags("SPEC-04 Compatibilidad")
@ApiBearerAuth()
@UseGuards(GroupSessionGuard)
@Controller("join-requests")
export class LegacyRequestsController {
  constructor(private readonly service: GroupMessagingService) {}

  /** Convierte solo la forma de respuesta; las reglas y la autorización siguen en el servicio. */
  @Get("me")
  async mine(@GroupActor() user: ChatIdentity) {
    const requests = await this.service.requests(user.id);
    return {
      requests: requests.map((request: JoinRequestDto) => ({
        ...request,
        group: { group_id: request.groupId, group_name: request.groupName },
        requester: {
          user_id: request.userId,
          name: request.applicant.name,
          profile_photo_url: request.applicant.profilePhotoUrl,
        },
        created_at: request.createdAt,
      })),
      total: requests.length,
      message: requests.length
        ? null
        : "No hay solicitudes pendientes por revisar.",
    };
  }

  /** Traduce accepted a approved sin volver a implementar decisiones ni comprobaciones de cupo. */
  @Patch(":requestId")
  decide(
    @Param("requestId", new ParseUUIDPipe({ version: "4" })) requestId: string,
    @GroupActor() user: ChatIdentity,
    @Body() dto: LegacyDecisionDto,
  ) {
    return this.service.decideLegacy(
      requestId,
      user.id,
      dto.action === "accepted" ? "approved" : "rejected",
    );
  }
}
