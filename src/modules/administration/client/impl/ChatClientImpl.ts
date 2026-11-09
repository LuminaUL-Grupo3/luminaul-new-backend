import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatClient } from '../ChatClient';
import { CONTENT_VISIBILITY_CHANGED_EVENT } from '../../administration.constants';

/**
 * Patrón Adapter: adapta contentVisibilityChanged() a EventEmitter2. ChatGateway (SPEC-04)
 * escucha 'content.visibility_changed' y vuelve a leer el estado guardado en la BD, así
 * que aquí no se envían textos, solo el tipo y el id del contenido.
 */
@Injectable()
export class ChatClientImpl extends ChatClient {
  constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  contentVisibilityChanged(contentType: string, contentId: string): void {
    this.eventEmitter.emit(CONTENT_VISIBILITY_CHANGED_EVENT, { contentType, contentId });
  }
}
