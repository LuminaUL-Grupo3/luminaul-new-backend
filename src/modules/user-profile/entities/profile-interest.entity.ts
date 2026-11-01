import { Entity, PrimaryColumn } from 'typeorm';

@Entity('profile_interests')
export class ProfileInterestEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @PrimaryColumn({ type: 'varchar', length: 50, name: 'interest_name' })
  interestName!: string;
}
