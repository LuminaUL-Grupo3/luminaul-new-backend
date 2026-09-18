import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { ProfileEntity } from './entities/profile.entity';
import { SkillEntity } from './entities/skill.entity';
import { ProfileSkillEntity } from './entities/profile-skill.entity';
import { InterestEntity } from './entities/interest.entity';
import { ProfileInterestEntity } from './entities/profile-interest.entity';
import { AvailabilityEntity } from './entities/availability.entity';

@Module({
  imports: [
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
  exports: [TypeOrmModule],
})
export class UsersModule {}
