import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

// Decorator: excluye un endpoint del JwtAuthGuard. Útil si el integrador registra
// el guard de forma global (APP_GUARD); con @UseGuards por ruta no hace falta.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
