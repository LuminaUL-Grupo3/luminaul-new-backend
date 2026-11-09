import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth-security/auth.module';
import { NotificationEntity } from './entities/notification.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AdminController } from './controller/AdminController';
import { NotificationsController } from './controller/NotificationsController';
import { AdminService } from './service/AdminService';
import { AdminServiceImpl } from './service/impl/AdminServiceImpl';
import { NotificationsService } from './service/NotificationsService';
import { NotificationsServiceImpl } from './service/impl/NotificationsServiceImpl';
import { AdminRepository } from './repository/AdminRepository';
import { AdminRepositoryImpl } from './repository/impl/AdminRepositoryImpl';
import { NotificationsRepository } from './repository/NotificationsRepository';
import { NotificationsRepositoryImpl } from './repository/impl/NotificationsRepositoryImpl';
import { NotificationClient } from './client/NotificationClient';
import { NotificationClientImpl } from './client/impl/NotificationClientImpl';
import { ChatClient } from './client/ChatClient';
import { ChatClientImpl } from './client/impl/ChatClientImpl';
import { buildStatusStrategies } from './strategy/UserStatusChangeStrategy';
import { SuspendUserStrategy } from './strategy/impl/SuspendUserStrategy';
import { ReactivateUserStrategy } from './strategy/impl/ReactivateUserStrategy';
import { NotificationsListener } from './listeners/notifications.listener';
import { USER_STATUS_STRATEGIES } from './administration.constants';

// SPEC-07: panel de administración, auditoría y centro de notificaciones.
// Requiere EventEmitterModule.forRoot() registrado en AppModule.
@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity, AuditLogEntity]), AuthModule],
  controllers: [AdminController, NotificationsController],
  // Inversión de dependencias (DIP): cada abstracción recibe aquí su implementación.
  // Singleton: NestJS crea una sola instancia de cada provider y la comparte.
  providers: [
    { provide: AdminService, useClass: AdminServiceImpl },
    { provide: NotificationsService, useClass: NotificationsServiceImpl },
    { provide: AdminRepository, useClass: AdminRepositoryImpl },
    { provide: NotificationsRepository, useClass: NotificationsRepositoryImpl },
    { provide: NotificationClient, useClass: NotificationClientImpl },
    { provide: ChatClient, useClass: ChatClientImpl },
    SuspendUserStrategy,
    ReactivateUserStrategy,
    // Strategy (HU 7.1): mapa "estado pedido → estrategia". Una estrategia nueva se agrega
    // aquí y en inject, sin tocar AdminServiceImpl (OCP).
    {
      provide: USER_STATUS_STRATEGIES,
      useFactory: buildStatusStrategies,
      inject: [SuspendUserStrategy, ReactivateUserStrategy],
    },
    NotificationsListener,
  ],
  exports: [NotificationsService],
})
export class AdministrationModule {}
