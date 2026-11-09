import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../enums/UserRole';
import { UserAccountStatus } from '../enums/UserAccountStatus';
import { UserEntity } from '../entities/user.entity';

// Contrato AuthUserDto de SPEC-01: datos públicos de la sesión (sin hash ni tokens)
export class AuthUserDto {
  @ApiProperty({ format: 'uuid', example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  id!: string;

  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  email!: string;

  @ApiProperty({ example: 'Martín Vizcarra' })
  name!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.STUDENT })
  role!: UserRole;

  @ApiProperty({ enum: UserAccountStatus, enumName: 'UserAccountStatus', example: UserAccountStatus.ACTIVE })
  status!: UserAccountStatus;

  @ApiProperty({ example: true })
  isVerified!: boolean;

  static fromEntity(user: UserEntity): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
    };
  }
}
