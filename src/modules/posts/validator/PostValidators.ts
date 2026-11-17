import { HttpStatus } from '@nestjs/common';
import { ValidateBy, ValidationArguments } from 'class-validator';
import { ActiveGroupInfo } from '../client/GroupMessagingClient';
import { PostException } from '../exception/PostException';
import { POST_MESSAGES, POST_TYPES } from '../posts.constants';

function boundedIntError(
  value: unknown,
  label: string,
  min: number,
  max?: number,
): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return `${label} debe ser un número entero`;
  }
  if (value < min) {
    return `${label} debe ser mayor o igual a ${min}`;
  }
  if (max !== undefined && value > max) {
    return `${label} no puede superar ${max}`;
  }
  return null;
}

/** Valida entero y rango en orden, reportando solo el primer error (evita mensajes contradictorios en NaN). */
export function IsBoundedInt(
  label: string,
  min: number,
  max?: number,
): PropertyDecorator {
  return ValidateBy({
    name: 'isBoundedInt',
    validator: {
      validate: (value: unknown) => boundedIntError(value, label, min, max) === null,
      defaultMessage: (args?: ValidationArguments) =>
        boundedIntError(args?.value, label, min, max) as string,
    },
  });
}

/** Valida que el grupo exista, sea de tipo study_group y pertenezca al usuario (miembro activo o líder). */
export function validateLinkedStudyGroup(
  existing: ActiveGroupInfo | null,
  userId: string,
): ActiveGroupInfo {
  if (!existing) {
    throw new PostException(POST_MESSAGES.GROUP_NOT_FOUND, HttpStatus.NOT_FOUND);
  }
  if (existing.groupType !== undefined && existing.groupType !== POST_TYPES.STUDY_GROUP) {
    throw new PostException(POST_MESSAGES.GROUP_INVALID_TYPE, HttpStatus.BAD_REQUEST);
  }
  const notMember =
    existing.isMember === false ||
    (existing.isMember === undefined &&
      existing.leaderId !== undefined &&
      existing.leaderId !== userId);
  if (notMember) {
    throw new PostException(POST_MESSAGES.FORBIDDEN_GROUP_LINK, HttpStatus.FORBIDDEN);
  }
  return existing;
}
