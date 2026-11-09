import { DatabaseConnection } from '../../src/config/database-connection.singleton';
import { DataSourceOptions } from 'typeorm';

describe('Patrón Singleton: DatabaseConnection', () => {
  const dummyOptions: DataSourceOptions = {
    type: 'postgres',
    url: 'postgresql://localhost:5432/test',
  };

  beforeEach(async () => {
    await DatabaseConnection.resetInstance();
  });

  afterAll(async () => {
    await DatabaseConnection.resetInstance();
  });

  it('debe lanzar un error si se invoca getInstance por primera vez sin DataSourceOptions', () => {
    expect(() => DatabaseConnection.getInstance()).toThrow(
      'Se requieren DataSourceOptions para inicializar la instancia Singleton',
    );
  });

  it('debe retornar exactamente la misma instancia en memoria en llamadas sucesivas (Singleton)', () => {
    const instanceA = DatabaseConnection.getInstance(dummyOptions);
    const instanceB = DatabaseConnection.getInstance();
    const instanceC = DatabaseConnection.getInstance(dummyOptions);

    expect(instanceA).toBeDefined();
    expect(instanceA).toBe(instanceB);
    expect(instanceB).toBe(instanceC);
  });

  it('debe proveer acceso a la misma instancia de DataSource subyacente', () => {
    const instance = DatabaseConnection.getInstance(dummyOptions);
    const dataSourceA = instance.getDataSource();
    const dataSourceB = instance.getDataSource();

    expect(dataSourceA).toBeDefined();
    expect(dataSourceA).toBe(dataSourceB);
  });

  it('debe permitir resetear la instancia y re-instanciar limpiamente', async () => {
    const instance1 = DatabaseConnection.getInstance(dummyOptions);
    expect(instance1).toBeDefined();

    await DatabaseConnection.resetInstance();

    // Tras el reset, la primera llamada vuelve a requerir opciones
    expect(() => DatabaseConnection.getInstance()).toThrow();

    const instance2 = DatabaseConnection.getInstance(dummyOptions);
    expect(instance2).toBeDefined();
    // Es una nueva referencia tras el reset
    expect(instance2).not.toBe(instance1);
  });
});

