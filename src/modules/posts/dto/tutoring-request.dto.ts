import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTutoringRequestDto {
  @IsString({ message: 'El mensaje debe ser texto' })
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(255, { message: 'El mensaje no puede superar los 255 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message!: string;
}

export class DecideTutoringRequestDto {
  @IsString({ message: 'status debe ser texto' })
  @IsIn(['accepted', 'rejected'], {
    message: 'status debe ser accepted o rejected',
  })
  status!: 'accepted' | 'rejected';
}

export interface TutoringRequestIncomingDto {
  id: string;
  publicationId: string;
  tutorId: string;
  requesterId: string;
  message: string;
  status: string;
  createdAt: string;
  courseName: string;
  publicationDescription: string;
  applicant: {
    id: string;
    name: string;
    email: string;
    profilePhotoUrl: string | null;
  };
}

export interface MyTutoringRequestDto {
  id: string;
  publicationId: string;
  status: string;
  groupId: string | null;
  createdAt: string;
}
