import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth-security/auth.module';
import { ProfileEntity } from './entities/profile.entity';
import { AvailabilityEntity } from './entities/availability.entity';
import { ProfileSkillEntity } from './entities/profile-skill.entity';
import { ProfileInterestEntity } from './entities/profile-interest.entity';
import { UserProfileRepository } from './repository/user-profile.repository';
import { UserProfileRepositoryImpl } from './repository/impl/user-profile.repository.impl';
import { UserProfileService } from './service/user-profile.service';
import { UserProfileServiceImpl } from './service/impl/user-profile.service.impl';
import { UserProfileController } from './controller/user-profile.controller';

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
  providers: [
    { provide: UserProfileRepository, useClass: UserProfileRepositoryImpl },
    { provide: UserProfileService, useClass: UserProfileServiceImpl },
  ],
  exports: [UserProfileService],
})
export class UserProfileModule {}
