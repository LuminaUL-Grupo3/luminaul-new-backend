import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  let databaseUrl = configService.get<string>('DATABASE_URL') || '';

  // Sanitizar dialectos de SQLAlchemy como postgresql+psycopg://
  if (databaseUrl.startsWith('postgresql+psycopg://')) {
    databaseUrl = databaseUrl.replace('postgresql+psycopg://', 'postgresql://');
  } else if (databaseUrl.startsWith('postgres://')) {
    databaseUrl = databaseUrl.replace('postgres://', 'postgresql://');
  }

  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  return {
    type: 'postgres',
    url: databaseUrl,
    autoLoadEntities: true,
    synchronize: false, // Migraciones y esquema gestionados manualmente de forma segura
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    extra: {
      max: 10,
      idleTimeoutMillis: 30000,
    },
  };
};
