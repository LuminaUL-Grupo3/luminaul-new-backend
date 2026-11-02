import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BannedWordSeverity } from '../enums/moderation.enums';

// Catálogo de palabras prohibidas que usa el motor léxico de moderación
@Entity('banned_words')
export class BannedWordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  word!: string;

  @Column({ type: 'varchar', length: 20, default: BannedWordSeverity.HIGH })
  severity!: BannedWordSeverity;
}
