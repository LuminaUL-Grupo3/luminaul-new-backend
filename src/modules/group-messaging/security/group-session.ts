import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { SessionService } from "../../../auth/services/session.service";
import { extractToken } from "../../../auth/token.util";
import { ChatIdentity } from "../types/messaging.types";

export type GroupRequest = Request & { chatUser: ChatIdentity };
/** Solo el directorio y el detalle permiten lectura pública; nunca el chat ni los miembros. */
export const PublicGroupRead = () => SetMetadata("groups:public-read", true);

/** Adaptador del contrato de sesiones de SPEC-01, sin importar entidades de ese módulo. */
@Injectable()
export class GroupSession {
  constructor(private readonly sessions: SessionService) {}
  /** Consulta la sesión vigente en cada operación para aplicar revocaciones y suspensiones. */
  async validate(token: string | null | undefined): Promise<ChatIdentity> {
    if (!token)
      throw new UnauthorizedException("Inicia sesión para continuar.");
    const { user, payload } = await this.sessions.validate(token);
    if (!user.isVerified)
      throw new UnauthorizedException("Verifica tu cuenta para continuar.");
    return { id: user.id, name: user.name, expiresAt: payload.exp * 1000 };
  }
}

/** Protege las rutas del módulo sin recurrir al usuario fijo heredado de otras pantallas. */
@Injectable()
export class GroupSessionGuard implements CanActivate {
  constructor(
    private readonly session: GroupSession,
    private readonly reflector: Reflector,
  ) {}
  /** Distingue consultas públicas del dominio de las operaciones que exigen una cuenta activa. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<GroupRequest>();
    const token = extractToken(req.headers.authorization, req.headers.cookie);
    const publicRead = this.reflector.getAllAndOverride<boolean>(
      "groups:public-read",
      [context.getHandler(), context.getClass()],
    );
    if (publicRead && !token) req.chatUser = { id: "", name: "", expiresAt: 0 };
    else req.chatUser = await this.session.validate(token);
    return true;
  }
}

/** Expone únicamente la identidad verificada por GroupSessionGuard. */
export const GroupActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ChatIdentity => {
    const user = ctx.switchToHttp().getRequest<GroupRequest>().chatUser;
    if (!user) throw new UnauthorizedException("Inicia sesión para continuar.");
    return user;
  },
);
