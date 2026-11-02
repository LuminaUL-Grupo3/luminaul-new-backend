import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { REACTION_EMOJIS, ReactionEmoji } from "../types/messaging.types";

/** Identifica una sala; el usuario nunca puede escoger la identidad del emisor. */
export class WsJoinRoomDto {
  @IsUUID("4") groupId!: string;
}
/** Añade una clave de reintento opcional sin cambiar el payload mínimo de la especificación. */
export class WsSendMessageDto extends WsJoinRoomDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: "Escribe un mensaje antes de enviarlo." })
  @MaxLength(4000)
  content!: string;
  @IsOptional() @IsUUID("4") clientMessageId?: string;
  @IsOptional() @IsUUID("4") replyToId?: string;
}
/** El estado de escritura es efímero y no crea registros en PostgreSQL. */
export class WsTypingDto extends WsJoinRoomDto {
  @IsBoolean() isTyping!: boolean;
}
/** Limita las reacciones a las opciones admitidas por la interfaz. */
export class WsReactionDto extends WsJoinRoomDto {
  @IsUUID("4") messageId!: string;
  @IsIn(REACTION_EMOJIS) emoji!: ReactionEmoji;
}
/** Avanza la lectura hasta un mensaje visible del grupo, nunca hacia atrás. */
export class WsReadMessageDto extends WsJoinRoomDto {
  @IsUUID("4") messageId!: string;
}
