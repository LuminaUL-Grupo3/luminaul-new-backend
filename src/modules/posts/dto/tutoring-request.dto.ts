import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTutoringRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'message cannot be empty' })
  @MaxLength(255, { message: 'message must not exceed 255 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message!: string;
}

export class DecideTutoringRequestDto {
  @IsString()
  @IsIn(['accepted', 'rejected'], {
    message: 'status must be accepted or rejected',
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
