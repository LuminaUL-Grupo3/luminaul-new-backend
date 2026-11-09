import { HttpException, HttpStatus } from '@nestjs/common';

// Error de negocio de SPEC-01 con su código HTTP (400, 401, 403 o 409), como ReviewException en reviews.
// Extiende HttpException para que AllExceptionsFilter responda con ese código y el mensaje.
export class AuthException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, status);
  }
}
