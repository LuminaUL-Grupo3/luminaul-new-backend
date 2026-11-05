import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth-security/auth.module';
import { BannedWordEntity } from './entities/banned-word.entity';
import { ContentModerationLogEntity } from './entities/content-moderation-log.entity';
import { ContentReportEntity } from './entities/content-report.entity';
import { ContentAppealEntity } from './entities/content-appeal.entity';
import { ModerationRepository } from './repositories/moderation.repository';
import { ModerationService } from './services/moderation.service';
import { ContentModerationService } from './services/content-moderation.service';
import { ContentCreatedListener } from './listeners/content-created.listener';
import { ModerationController } from './controllers/moderation.controller';

// SPEC-06: moderación automática por filtro léxico, reportes y apelaciones.
// Requiere EventEmitterModule.forRoot() registrado en AppModule.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BannedWordEntity,
      ContentModerationLogEntity,
      ContentReportEntity,
      ContentAppealEntity,
    ]),
    AuthModule,
  ],
  controllers: [ModerationController],
  providers: [
    ModerationRepository,
    ModerationService,
    ContentModerationService,
    ContentCreatedListener,
  ],
  exports: [TypeOrmModule, ContentModerationService],
})
export class ModerationModule {}
