import { NotificationSendEvent } from '../events/notification-send.event';

/**
 * Patrón Adapter: interfaz que el panel de administración usa para avisar a un alumno
 * (Target del Adapter, como PagoGateway en el proyecto del profesor).
 *
 * El service solo dice "notifica a este usuario"; no sabe que por debajo hay un bus de
 * eventos (EventEmitter2). Si mañana el aviso fuera por correo, solo cambia la
 * implementación (impl/NotificationClientImpl.ts) y el service queda igual.
 */
export abstract class NotificationClient {
  abstract notify(notice: NotificationSendEvent): void;
}
