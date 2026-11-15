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
import { AvailabilityRule } from './strategy/AvailabilityRule';
import { OperatingHoursRule } from './strategy/impl/OperatingHoursRule';
import { StartBeforeEndRule } from './strategy/impl/StartBeforeEndRule';
import { NoOverlapRule } from './strategy/impl/NoOverlapRule';
import { USER_PROFILE_AVAILABILITY_RULES } from './user-profile.constants';

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
    OperatingHoursRule,
    StartBeforeEndRule,
    NoOverlapRule,
    // Factory provider: arma la lista de estrategias en el orden de validación:
    // horario de operación -> inicio antes que fin -> sin traslape
    {
      provide: USER_PROFILE_AVAILABILITY_RULES,
      useFactory: (...rules: AvailabilityRule[]) => rules,
      inject: [OperatingHoursRule, StartBeforeEndRule, NoOverlapRule],
    },
  ],
  exports: [UserProfileService],
})
export class UserProfileModule {}
