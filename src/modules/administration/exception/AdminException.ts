import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Error de negocio de SPEC-07 (panel de administración y notificaciones).
 *
 * Lleva el mensaje exacto que verá el usuario (constantes de administration.constants.ts)
 * y el código HTTP que corresponde. Extiende HttpException para que el filtro global
 * AllExceptionsFilter responda con ese código y ese mensaje, igual que ReviewException
 * en SPEC-05 o las excepciones propias del proyecto del profesor.
 */
export class AdminException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, status);
  }
}
