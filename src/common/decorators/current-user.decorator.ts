import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const DEMO_USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    return request.user?.id || DEMO_USER_ID;
  },
);
