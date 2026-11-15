import { Global, Module } from '@nestjs/common';
import { InMemoryTtlCache } from './in-memory-ttl.cache';

@Global()
@Module({
  providers: [InMemoryTtlCache],
  exports: [InMemoryTtlCache],
})
export class CommonCacheModule {}

