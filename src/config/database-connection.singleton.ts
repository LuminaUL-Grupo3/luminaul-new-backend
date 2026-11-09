import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Patrón Creacional: Singleton (GoF)
 *
 * Garantiza que exista una única instancia de conexión y pool hacia la base de datos PostgreSQL
 * en toda la aplicación, proporcionando un punto de acceso global y controlado.
 **/

export class DatabaseConnection {
  private static instance: DatabaseConnection | null = null;
  private readonly dataSource: DataSource;

  // 1. Constructor privado que previene la creación de instancias externas con new DatabaseConnection(...)
  private constructor(options: DataSourceOptions) {
    this.dataSource = new DataSource(options);
  }

  // 2. Punto de acceso global único (GoF) con lazy initialization
  public static getInstance(options?: DataSourceOptions): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      if (!options) {
        throw new Error(
          'Se requieren DataSourceOptions para inicializar la instancia Singleton de DatabaseConnection.',
        );
      }
      DatabaseConnection.instance = new DatabaseConnection(options);
    }
    return DatabaseConnection.instance;
  }

  // 3. Inicializa el DataSource subyacente si aún no está conectado
  public async initialize(): Promise<DataSource> {
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }
    return this.dataSource;
  }

  // 4. Retorna el DataSource gestionado por el Singleton
  public getDataSource(): DataSource {
    return this.dataSource;
  }

  // 5. Método auxiliar para pruebas unitarias y reinicio controlado de estado
  public static async resetInstance(): Promise<void> {
    if (DatabaseConnection.instance) {
      if (DatabaseConnection.instance.dataSource.isInitialized) {
        await DatabaseConnection.instance.dataSource.destroy();
      }
      DatabaseConnection.instance = null;
    }
  }
}

