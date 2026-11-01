import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module';
import { ProfileEntity } from './entities/profile.entity';
import { AvailabilityEntity } from './entities/availability.entity';
import { ProfileSkillEntity } from './entities/profile-skill.entity';
import { ProfileInterestEntity } from './entities/profile-interest.entity';
import { UserProfileRepository } from './user-profile.repository';
import { UserProfileService } from './user-profile.service';
import { UserProfileController } from './user-profile.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProfileEntity,
      AvailabilityEntity,
      ProfileSkillEntity,
      ProfileInterestEntity,
    ]),
    AuthModule,
  ],
  controllers: [UserProfileController],
  providers: [UserProfileRepository, UserProfileService],
  exports: [UserProfileService],
})
export class UserProfileModule {}
