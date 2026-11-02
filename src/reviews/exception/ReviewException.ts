import { HttpException, HttpStatus } from '@nestjs/common';

// Error de negocio de SPEC-05 con su código HTTP, como PagoException del proyecto de la Semana 08.
// Extiende HttpException para que AllExceptionsFilter responda con ese código y el mensaje.
export class ReviewException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, status);
  }
}
