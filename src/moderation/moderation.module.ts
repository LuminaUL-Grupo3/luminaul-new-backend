import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportEntity } from './entities/report.entity';
import { ModerationLogEntity } from './entities/moderation-log.entity';
import { AppealEntity } from './entities/appeal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportEntity,
      ModerationLogEntity,
      AppealEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class ModerationModule {}
