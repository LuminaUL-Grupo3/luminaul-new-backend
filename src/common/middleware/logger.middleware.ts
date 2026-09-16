import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as http from 'http';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      // Omitir peticiones de assets estáticos de Swagger UI para no saturar la terminal
      if (
        originalUrl.endsWith('.css') ||
        originalUrl.endsWith('.js') ||
        originalUrl.endsWith('.ico') ||
        originalUrl.endsWith('.png') ||
        originalUrl.endsWith('.map')
      ) {
        return;
      }

      const { statusCode } = res;
      const statusMessage = res.statusMessage || http.STATUS_CODES[statusCode] || '';
      const responseTime = Date.now() - startTime;

      const logMessage = `${method} ${originalUrl} HTTP ${statusCode} ${statusMessage} - ${responseTime}ms`;

      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    next();
  }
}
