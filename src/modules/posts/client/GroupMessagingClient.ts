export interface AutoGroupInput {
  name: string;
  description?: string | null;
  benefits?: string | null;
  requirements?: string | null;
}

/**
 * Puerto hacia el módulo de grupos de estudio (SPEC-04).
 * Permite validar la existencia de un grupo y solicitar la creación de uno nuevo.
 */
export abstract class GroupMessagingClient {
  abstract findActiveById(groupId: string): Promise<{ id: string } | null>;
  abstract createAutoGroup(input: AutoGroupInput, userId: string): Promise<string>;
}

