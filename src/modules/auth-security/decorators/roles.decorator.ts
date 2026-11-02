import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

export const ROLES_KEY = 'auth:roles';

// Decorator: declara qué roles pueden usar un endpoint. Usar con
// @UseGuards(JwtAuthGuard, RolesGuard), por ejemplo @Roles(UserRole.ADMIN) en SPEC-07.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
