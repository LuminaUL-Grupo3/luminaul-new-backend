import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

export class HealthCheckResponseDto {
  status!: string;
  service!: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Verificar el estado del servicio' })
  @ApiResponse({
    status: 200,
    description: 'Servicio en ejecución correctamente',
    type: HealthCheckResponseDto,
  })
  healthCheck(): HealthCheckResponseDto {
    return {
      status: 'ok',
      service: 'luminaul-backend',
    };
  }
}
