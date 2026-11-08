import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter';

/**
 * Prefijo de toda la API REST: /api/auth, /api/posts, /api/docs...
 * Socket.io no se ve afectado y sigue en /socket.io.
 */
export const API_PREFIX = 'api';

/**
 * Configuración HTTP común a main.ts y a las pruebas e2e, para que ambos
 * expongan exactamente las mismas rutas, filtros y validaciones.
 */
export function configureHttpApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}
