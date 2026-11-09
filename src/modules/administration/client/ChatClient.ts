/**
 * Patrón Adapter: interfaz hacia el chat en tiempo real (SPEC-04).
 *
 * Cuando el administrador elimina un mensaje (HU 7.2) o aprueba una apelación (HU 7.3),
 * el chat debe ocultarlo o mostrarlo de nuevo en vivo. El service solo avisa "cambió la
 * visibilidad de este contenido"; cómo llega al chat lo decide impl/ChatClientImpl.ts.
 */
export abstract class ChatClient {
  abstract contentVisibilityChanged(contentType: string, contentId: string): void;
}
