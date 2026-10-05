import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import type {} from 'multer';

@Injectable()
export class ProfilePhotoStorage {
  async save(file?: Express.Multer.File) {
    if (!file || file.size === 0 || file.size > 2 * 1024 * 1024) throw new BadRequestException('Elige una foto PNG, JPG o WebP de hasta 2 MB.');
    const b = file.buffer;
    const isPng = b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const isWebp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
    const extension = file.mimetype === 'image/png' && isPng ? 'png' : file.mimetype === 'image/jpeg' && isJpg ? 'jpg' : file.mimetype === 'image/webp' && isWebp ? 'webp' : null;
    if (!extension) throw new BadRequestException('La foto debe ser un archivo PNG, JPG o WebP válido.');
    const name = `${randomUUID()}.${extension}`, directory = resolve('uploads/profiles');
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, name), b, { flag: 'wx' });
    return { url: `/uploads/profiles/${name}`, remove: () => unlink(resolve(directory, name)) };
  }
}
