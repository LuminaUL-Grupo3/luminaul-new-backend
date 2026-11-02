import { ApiProperty } from '@nestjs/swagger';
import { UserRole, USER_ROLES } from '../enums/user-role.enum';
import { UserAccountStatus, USER_ACCOUNT_STATUSES } from '../enums/user-account-status.enum';
import { UserEntity } from '../entities/user.entity';

// Contrato AuthUserDto de SPEC-01: datos públicos de la sesión (sin hash ni tokens)
export class AuthUserDto {
  @ApiProperty({ format: 'uuid', example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  id!: string;

  @ApiProperty({ example: '20210001@aloe.ulima.edu.pe' })
  email!: string;

  @ApiProperty({ example: 'Martín Vizcarra' })
  name!: string;

  @ApiProperty({ enum: USER_ROLES, example: UserRole.STUDENT })
  role!: UserRole;

  @ApiProperty({ enum: USER_ACCOUNT_STATUSES, example: UserAccountStatus.ACTIVE })
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

export class RegisterResponseDto {
  @ApiProperty({
    example: 'Usuario registrado correctamente. Por favor revisa tu correo institucional.',
  })
  message!: string;

  @ApiProperty({ format: 'uuid', example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  userId!: string;

  @ApiProperty({ enum: USER_ACCOUNT_STATUSES, example: UserAccountStatus.PENDING_VERIFICATION })
  status!: UserAccountStatus;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class VerifyEmailResponseDto {
  @ApiProperty({ example: 'Cuenta verificada exitosamente. Ya puedes iniciar sesión.' })
  message!: string;

  @ApiProperty({ example: true })
  isVerified!: boolean;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Operación realizada correctamente' })
  message!: string;
}
