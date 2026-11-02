import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GroupMembershipClient } from '../GroupMembershipClient';

// Adapter: traduce haveSharedGroup() a una consulta con el QueryBuilder de TypeORM (Adaptee)
// sobre la tabla histórica group_members, sin importar entidades del módulo de grupos
// (AGENTS.md 3.2). Cuenta los grupos donde ambos coincidieron: sus periodos [joined_at, left_at]
// se cruzan (left_at NULL = sigue en el grupo). SPEC-05: COUNT(*) > 0.
@Injectable()
export class GroupMembershipClientImpl extends GroupMembershipClient {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async haveSharedGroup(userId: string, otherUserId: string): Promise<boolean> {
    const row: { total: string } | undefined = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from('group_members', 'mine')
      .innerJoin('group_members', 'theirs', 'theirs.group_id = mine.group_id')
      .where('mine.user_id = :userId', { userId })
      .andWhere('theirs.user_id = :otherUserId', { otherUserId })
      .andWhere('mine.joined_at <= COALESCE(theirs.left_at, NOW())')
      .andWhere('theirs.joined_at <= COALESCE(mine.left_at, NOW())')
      .getRawOne();
    return Number(row?.total ?? 0) > 0;
  }
}
