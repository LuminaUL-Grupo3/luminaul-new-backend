import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth-security/auth.module';
import { ProfileEntity } from './entities/profile.entity';
import { AvailabilityEntity } from './entities/availability.entity';
import { ProfileSkillEntity } from './entities/profile-skill.entity';
import { ProfileInterestEntity } from './entities/profile-interest.entity';
import { UserProfileController } from './controller/UserProfileController';
import { UserProfileService } from './service/UserProfileService';
import { UserProfileServiceImpl } from './service/impl/UserProfileServiceImpl';
import { UserProfileRepository } from './repository/UserProfileRepository';
import { UserProfileRepositoryImpl } from './repository/impl/UserProfileRepositoryImpl';

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
  // Inversión de dependencias: cada abstracción recibe aquí su implementación
  providers: [
    { provide: UserProfileService, useClass: UserProfileServiceImpl },
    { provide: UserProfileRepository, useClass: UserProfileRepositoryImpl },
  ],
  exports: [UserProfileService],
})
export class UserProfileModule {}
