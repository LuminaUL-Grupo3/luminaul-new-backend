import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module';
import { NotificationEntity } from './entities/notification.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AdminRepository } from './repositories/admin.repository';
import { NotificationsRepository } from './repositories/notifications.repository';
import { AdminService } from './services/admin.service';
import { NotificationsService } from './services/notifications.service';
import { NotificationsListener } from './listeners/notifications.listener';
import { AdminController } from './controllers/admin.controller';
import { NotificationsController } from './controllers/notifications.controller';

// SPEC-07: panel de administración, auditoría y centro de notificaciones.
// Requiere EventEmitterModule.forRoot() registrado en AppModule.
@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity, AuditLogEntity]), AuthModule],
  controllers: [AdminController, NotificationsController],
  providers: [
    AdminRepository,
    NotificationsRepository,
    AdminService,
    NotificationsService,
    NotificationsListener,
  ],
  exports: [NotificationsService],
})
export class AdministrationModule {}
