import { ApiProperty } from '@nestjs/swagger';

export class AvailabilitySlotDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() dayOfWeek!: string;
  @ApiProperty({ example: '14:00' }) startTime!: string;
  @ApiProperty({ example: '16:00' }) endTime!: string;
}

export class StudentProfileDto {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) bio!: string | null;
  @ApiProperty({ type: String, nullable: true }) major!: string | null;
  @ApiProperty({ type: String, nullable: true }) academicCycle!: string | null;
  @ApiProperty({ type: String, nullable: true }) profilePhotoUrl!: string | null;
  @ApiProperty({ type: [String] }) skills!: string[];
  @ApiProperty({ type: [String] }) interests!: string[];
  @ApiProperty({ type: [AvailabilitySlotDto] }) availabilities!: AvailabilitySlotDto[];
  @ApiProperty() updatedAt!: string;
}

export class AvailabilityActionResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty({ type: AvailabilitySlotDto }) availability!: AvailabilitySlotDto;
}

export class DeleteAvailabilityResponseDto {
  @ApiProperty() message!: string;
  @ApiProperty() deletedId!: string;
}
