export interface AutoGroupInput {
  name: string;
  description?: string | null;
  benefits?: string | null;
  requirements?: string | null;
  courseCode?: string;
  meetingMode?: 'presencial' | 'virtual' | 'hibrido';
  meetingShift?: 'manana' | 'tarde' | 'noche';
  maxCapacity?: number;
}

export interface ActiveGroupInfo {
  id: string;
  leaderId?: string;
  groupType?: string;
  maxCapacity?: number;
  isMember?: boolean;
}

/**
 * Puerto hacia el módulo de grupos de estudio (SPEC-04).
 * Permite validar la existencia de un grupo y solicitar la creación de uno nuevo.
 */
export abstract class GroupMessagingClient {
  abstract findActiveById(groupId: string, userId?: string): Promise<ActiveGroupInfo | null>;
  abstract createAutoGroup(input: AutoGroupInput, userId: string): Promise<string>;
  abstract createTutoringRoom(
    tutorId: string,
    requesterId: string,
    name: string,
    description?: string | null,
  ): Promise<string>;
}

