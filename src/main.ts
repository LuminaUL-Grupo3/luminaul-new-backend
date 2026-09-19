import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Configuración de CORS idéntica a FastAPI
  app.enableCors({
    origin: '*',
    methods: '*',
    allowedHeaders: '*',
  });

  // Filtro de excepciones y validación estricta global
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Configuración interactiva de OpenAPI / Swagger en /docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('LuminaUL API')
    .setDescription('API del backend LuminaUL (Refactorizado de Python a NestJS)')
    .setVersion('0.1.0')
    .addTag('Health', 'Verificación de estado del servidor')
    .addTag('Courses', 'Módulo de cursos académicos')
    .addTag('Posts', 'Módulo de publicaciones (feed, historial, creación, edición, eliminación)')
    .addTag('Join Requests', 'Módulo de solicitudes de unión a grupos de estudio (H.U 2.2)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 8000;

  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`Swagger UI documentation available at: http://localhost:${port}/docs`);
}

bootstrap();
