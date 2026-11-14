/** Contrato de transporte sin entidades ni dependencias de almacenamiento. */
export interface DeliveredNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}
export interface NotificationDeliveryEvent {
  notification: DeliveredNotification;
  sessionRevoked?: boolean;
}
