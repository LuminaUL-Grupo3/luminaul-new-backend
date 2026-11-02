import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProfileClient } from '../ProfileClient';
import { ReviewAuthorDto } from '../../dto/ReviewResponseDto';

interface PersonRow {
  id: string;
  name: string | null;
  profilePhotoUrl: string | null;
}

// Adapter: traduce findPeople() a una consulta con el QueryBuilder de TypeORM (Adaptee) sobre las
// tablas users y profiles, sin importar entidades del módulo de usuarios (AGENTS.md 3.2).
// Si el alumno aún no completa su perfil, se usa el nombre de su cuenta.
@Injectable()
export class ProfileClientImpl extends ProfileClient {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async findPeople(userIds: string[]): Promise<Map<string, ReviewAuthorDto>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) {
      return new Map();
    }
    const rows: PersonRow[] = await this.dataSource
      .createQueryBuilder()
      .select('u.id', 'id')
      .addSelect('COALESCE(p.name, u.name)', 'name')
      .addSelect('p.profile_photo_url', 'profilePhotoUrl')
      .from('users', 'u')
      .leftJoin('profiles', 'p', 'p.user_id = u.id')
      .where('u.id IN (:...ids)', { ids })
      .getRawMany();
    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, name: row.name ?? '', profilePhotoUrl: row.profilePhotoUrl },
      ]),
    );
  }
}
