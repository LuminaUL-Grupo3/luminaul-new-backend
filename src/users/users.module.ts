import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { ProfileEntity } from './entities/profile.entity';
import { SkillEntity } from './entities/skill.entity';
import { ProfileSkillEntity } from './entities/profile-skill.entity';
import { InterestEntity } from './entities/interest.entity';
import { ProfileInterestEntity } from './entities/profile-interest.entity';
import { AvailabilityEntity } from './entities/availability.entity';
import { AuthModule } from '../auth/auth.module';
import { ProfilesController, AvailabilityController } from './profiles.controller';
import { ProfilesRepository } from './profiles.repository';
import { ProfilesService } from './profiles.service';
import { ProfilePhotoStorage } from './profile-photo.storage';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      UserEntity,
      ProfileEntity,
      SkillEntity,
      ProfileSkillEntity,
      InterestEntity,
      ProfileInterestEntity,
      AvailabilityEntity,
    ]),
  ],
  controllers: [ProfilesController, AvailabilityController],
  providers: [ProfilesRepository, ProfilesService, ProfilePhotoStorage],
  exports: [TypeOrmModule],
})
export class UsersModule {}
