export interface CourseData {
  id: string;
  name: string;
  cycle?: number | null;
}

/**
 * Puerto hacia el catálogo de cursos (SPEC-03 / Catálogo).
 * Posts no interactúa con entidades ajenas directamente; solo consulta lo que necesita.
 */
export abstract class CoursesClient {
  abstract findById(courseId: string): Promise<CourseData | null>;
}

