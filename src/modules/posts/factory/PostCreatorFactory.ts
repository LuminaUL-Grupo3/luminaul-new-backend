import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PostCreator } from './PostCreator';
import { POST_CREATORS, POST_MESSAGES } from '../posts.constants';

/**
 * Factory Dispatcher que resuelve el creador correspondiente según el tipo de publicación.
 * Utiliza inyección polimórfica de lista de creadores (Factory Provider Pattern)
 * indexándolos en un Map para resolución O(1) desacoplada y extensible sin modificar código (OCP).
 */
@Injectable()
export class PostCreatorFactory {
  private readonly creatorsMap = new Map<string, PostCreator>();

  constructor(
    @Inject(POST_CREATORS)
    creators: PostCreator[],
  ) {
    for (const creator of creators) {
      this.creatorsMap.set(creator.type, creator);
    }
  }

  getCreator(type: string): PostCreator {
    const creator = this.creatorsMap.get(type);
    if (!creator) {
      throw new UnprocessableEntityException(POST_MESSAGES.UNSUPPORTED_TYPE);
    }
    return creator;
  }
}


