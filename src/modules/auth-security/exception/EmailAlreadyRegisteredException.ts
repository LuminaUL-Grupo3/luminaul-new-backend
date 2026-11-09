import { AUTH_MESSAGES } from '../auth.constants';

// Error de dominio que lanza la capa de datos cuando el correo ya existe (violación UNIQUE).
// No hereda de HttpException: el repositorio no conoce HTTP (patrón DAO). AuthServiceImpl lo
// traduce a un AuthException con 409.
export class EmailAlreadyRegisteredException extends Error {
  constructor() {
    super(AUTH_MESSAGES.EMAIL_TAKEN);
    this.name = 'EmailAlreadyRegisteredException';
  }
}
