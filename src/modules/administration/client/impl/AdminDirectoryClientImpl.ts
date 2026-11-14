import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../auth-security/enums/UserRole';
import { ManagedUserStatus } from '../../enums/administration.enums';
import { AdminDirectoryClient } from '../AdminDirectoryClient';

/**
 * Consulta SQL parametrizada hacia la tabla users dentro de client/impl/ (AGENTS.md §3.3),
 * manteniendo NotificationsRepositoryImpl limitado a la tabla notifications.
 */
@Injectable()
export class AdminDirectoryClientImpl extends AdminDirectoryClient {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findActiveAdminIds(): Promise<string[]> {
    const rows: { id: string }[] = await this.dataSource.query(
      'SELECT id FROM users WHERE role = $1 AND status = $2 AND deleted_at IS NULL',
      [UserRole.ADMIN, ManagedUserStatus.ACTIVE],
    );
    return rows.map((row) => row.id);
  }
}

