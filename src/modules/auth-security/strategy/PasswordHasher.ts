// Strategy: algoritmo de hash de contraseñas. Se inyecta por la clase abstracta
// (token de DI), así los servicios no dependen de bcrypt y los tests usan un doble.
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract compare(plain: string, hash: string): Promise<boolean>;
}
