import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth-security/auth.module';
import { BannedWordEntity } from './entities/banned-word.entity';
import { ContentModerationLogEntity } from './entities/content-moderation-log.entity';
import { ContentReportEntity } from './entities/content-report.entity';
import { ContentAppealEntity } from './entities/content-appeal.entity';
import { ContentModerationTaskEntity } from './entities/content-moderation-task.entity';
import { ModerationRepository } from './repository/moderation.repository';
import { ModerationRepositoryImpl } from './repository/impl/moderation.repository.impl';
import { ModerationService } from './service/moderation.service';
import { ModerationServiceImpl } from './service/impl/moderation.service.impl';
import { ContentModerationService } from './service/content-moderation.service';
import { ContentCreatedListener } from './listeners/content-created.listener';
import { ModerationController } from './controller/moderation.controller';
import { ProfanityFilterService } from './service/profanity-filter.service';
import { OpenAiModerationService } from './service/openai-moderation.service';
import { ModerationTaskWorkerService } from './service/moderation-task-worker.service';
import { MODERATED_CONTENT } from './policies/moderated-content';
import { TargetContentType } from './enums/moderation.enums';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BannedWordEntity,
      ContentModerationLogEntity,
      ContentReportEntity,
      ContentAppealEntity,
      ContentModerationTaskEntity,
    ]),
    AuthModule,
  ],
  controllers: [ModerationController],
  // Inversión de dependencias: cada abstracción recibe aquí su implementación (como SPEC-05).
  providers: [
    { provide: ModerationRepository, useClass: ModerationRepositoryImpl },
    { provide: ModerationService, useClass: ModerationServiceImpl },
    ContentModerationService,
    ContentCreatedListener,
    ProfanityFilterService,
    OpenAiModerationService,
    ModerationTaskWorkerService,
  ],
  exports: [
    TypeOrmModule,
    ContentModerationService,
    ProfanityFilterService,
    OpenAiModerationService,
    ModerationTaskWorkerService,
  ],
})
export class ModerationModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ModerationModule.name);

  constructor(
    private readonly repository: ModerationRepository,
    private readonly worker: ModerationTaskWorkerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      // 1. Reconciliar tareas colgadas por fallos o reinicios de workers
      const staleRecovered = await this.repository.reconcileStaleTasks();
      if (staleRecovered > 0) {
        this.logger.log(`Reconciliador: ${staleRecovered} tareas con lease caducado reactivadas a 'pending'.`);
      }

      // 2. Barrido de reconciliación para contenidos huérfanos sin moderar
      let totalEnqueued = 0;
      for (const [contentType, source] of Object.entries(MODERATED_CONTENT)) {
        const unmoderatedIds = await this.repository.findUnmoderatedContentIds(source, 20);
        for (const contentId of unmoderatedIds) {
          await this.repository.enqueueTask(contentType as TargetContentType, contentId, 1);
          totalEnqueued++;
        }
      }

      if (totalEnqueued > 0) {
        this.logger.log(`Reconciliador: ${totalEnqueued} contenidos huérfanos encolados para moderación.`);
      }

      // 3. Procesar backlog inicial
      await this.worker.processBatch();
    } catch (error) {
      this.logger.warn('Error durante la reconciliación inicial de moderación', error);
    }
  }
}
