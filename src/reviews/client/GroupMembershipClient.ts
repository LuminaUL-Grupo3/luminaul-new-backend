// Puerto hacia los datos de grupos (SPEC-04), como PagoClient en el proyecto de la Semana 08:
// reviews no sabe cómo se guardan las membresías, solo pregunta lo que necesita.
// Adapter: esta es la interfaz que espera el módulo (Target); GroupMembershipClientImpl la adapta.
export abstract class GroupMembershipClient {
  // ¿Ambos alumnos fueron miembros del mismo grupo de estudio al mismo tiempo?
  abstract haveSharedGroup(userId: string, otherUserId: string): Promise<boolean>;
}
