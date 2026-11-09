import { HttpException, HttpStatus } from '@nestjs/common';

// Error de dominio del módulo de publicaciones (SPEC-03) con su código HTTP.
// Extiende HttpException para que AllExceptionsFilter responda con ese código y mensaje.
export class PostException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, status);
  }
}

