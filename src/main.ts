import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_PREFIX, configureHttpApp } from './config/http-app.config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Cabeceras HTTP de seguridad (desactivando CSP restrictivo para compatibilidad con Swagger UI)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Configuración de CORS idéntica a FastAPI (preservada según requerimiento)
  app.enableCors({
    origin: '*',
    methods: '*',
    allowedHeaders: '*',
  });

  // Prefijo /api, filtro de excepciones y validación estricta global (compartido con las pruebas e2e)
  configureHttpApp(app);

  // Configuración interactiva de OpenAPI / Swagger en /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('LuminaUL API')
    .setDescription('API del backend LuminaUL (Refactorizado de Python a NestJS)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('Auth', 'Autenticación y cierre de sesión')
    .addTag('Health', 'Verificación de estado del servidor')
    .addTag('Courses', 'Módulo de cursos académicos')
    .addTag('Posts', 'Módulo de publicaciones (feed, historial, creación, edición, eliminación)')
    .addTag('Groups', 'Módulo de grupos de estudio (H.U 2.1: detalle del grupo)')
    .addTag('Join Requests', 'Módulo de solicitudes de unión a grupos de estudio (H.U 2.1 y 2.2)')
    .addTag('Administration', 'Panel de administración: reportes, apelaciones y cuentas (SPEC-07)')
    .addTag('Notifications', 'Centro de notificaciones del alumno (SPEC-07)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // setup() no aplica el prefijo global por sí solo: queda en /api/docs y /api/docs-json
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 8000;

  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`Swagger UI documentation available at: http://localhost:${port}/${API_PREFIX}/docs`);
}

bootstrap();
