import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupEntity } from './entities/group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GroupEntity])],
  exports: [TypeOrmModule],
})
export class GroupsModule {}
