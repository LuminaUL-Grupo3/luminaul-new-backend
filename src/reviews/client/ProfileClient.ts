import { ReviewAuthorDto } from '../dto/ReviewResponseDto';

// Puerto hacia los datos de perfil (SPEC-02): nombre y foto de los alumnos de una reseña.
// Adapter: esta es la interfaz que espera el módulo (Target); ProfileClientImpl la adapta.
export abstract class ProfileClient {
  // Datos públicos de cada alumno pedido, indexados por id (los que no existen no vienen)
  abstract findPeople(userIds: string[]): Promise<Map<string, ReviewAuthorDto>>;
}
