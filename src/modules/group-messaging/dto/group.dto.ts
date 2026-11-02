import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Valida los datos de creación; la identidad del líder se obtiene de la sesión. */
export class CreateGroupDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 100)
  name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiProperty() @IsString() @Length(1, 20) courseCode!: string;
  @ApiPropertyOptional({ enum: ["presencial", "virtual", "hibrido"] })
  @IsOptional()
  @IsIn(["presencial", "virtual", "hibrido"])
  meetingMode: "presencial" | "virtual" | "hibrido" = "virtual";
  @ApiPropertyOptional({ enum: ["manana", "tarde", "noche"] })
  @IsOptional()
  @IsIn(["manana", "tarde", "noche"])
  meetingShift: "manana" | "tarde" | "noche" = "manana";
  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxCapacity = 6;
}
/** Acota el directorio para que una petición no descargue todos los grupos. */
export class GroupFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  courseCode?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(["presencial", "virtual", "hibrido"])
  meetingMode?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit =
    50;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}
/** Acepta una presentación opcional conforme al contrato de SPEC-04. */
export class CreateJoinRequestDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MaxLength(255)
  message?: string;
}
/** Impide transiciones arbitrarias del estado de una solicitud. */
export class DecideJoinRequestDto {
  @ApiProperty({ enum: ["approved", "rejected"] })
  @IsIn(["approved", "rejected"])
  status!: "approved" | "rejected";
}
/** Solo permite transferir el liderazgo a un miembro identificado por UUID. */
export class TransferLeadershipDto {
  @ApiProperty({ format: "uuid" }) @IsUUID("4") userId!: string;
}
/** Valida la paginación del historial y evita offsets negativos. */
export class MessageHistoryQueryDto {
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit =
    50;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Ancla estable para cargar mensajes anteriores sin saltos al recibir mensajes nuevos.",
  })
  @IsOptional()
  @IsUUID("4")
  beforeId?: string;
}
