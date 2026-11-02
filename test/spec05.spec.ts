import 'reflect-metadata';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ReviewsController } from '../src/reviews/controller/ReviewsController';
import { ReviewsServiceImpl } from '../src/reviews/service/impl/ReviewsServiceImpl';
import { ReviewsRepository } from '../src/reviews/repository/ReviewsRepository';
import { ModerationClient } from '../src/reviews/client/ModerationClient';
import { ProfileClient } from '../src/reviews/client/ProfileClient';
import { NoSelfReviewRule } from '../src/reviews/strategy/impl/NoSelfReviewRule';
import { SharedGroupRule } from '../src/reviews/strategy/impl/SharedGroupRule';
import { UniqueReviewRule } from '../src/reviews/strategy/impl/UniqueReviewRule';
import { GroupMembershipClient } from '../src/reviews/client/GroupMembershipClient';
import { CreateReviewDto } from '../src/reviews/dto/CreateReviewDto';
import { UpdateReviewDto } from '../src/reviews/dto/UpdateReviewDto';
import { ReviewEntity } from '../src/reviews/entities/review.entity';
import { ReviewException } from '../src/reviews/exception/ReviewException';
import { REVIEW_MESSAGES, REVIEW_STATUS } from '../src/reviews/reviews.constants';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';

const REVIEWER_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const REVIEWED_ID = 'a1b2c3d4-e5f6-47a8-b9c0-123456789abc';
const OTHER_USER_ID = '99887766-5544-4322-8100-aabbccddeeff';

const asyncMock = () => jest.fn<(...args: any[]) => Promise<any>>();

const sampleReview = (id = 'r1', rating = 5, comment = 'Gran compañero'): ReviewEntity => ({
  id,
  reviewerId: REVIEWER_ID,
  reviewedUserId: REVIEWED_ID,
  rating,
  comment,
  status: REVIEW_STATUS.PUBLISHED,
  createdAt: new Date('2026-10-29T14:35:00.000Z'),
  updatedAt: new Date('2026-10-29T14:35:00.000Z'),
  deletedAt: null,
});

describe('SPEC-05: Reseñas y Calificaciones entre Estudiantes', () => {
  describe('1. Validación de DTOs (CreateReviewDto y UpdateReviewDto)', () => {
    it('debe validar exitosamente un CreateReviewDto válido', async () => {
      const dto = plainToInstance(CreateReviewDto, {
        reviewedUserId: REVIEWED_ID,
        rating: 5,
        comment: 'Excelente trabajo en equipo',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('debe rechazar un rating fuera del rango 1-5', async () => {
      const dtoLow = plainToInstance(CreateReviewDto, {
        reviewedUserId: REVIEWED_ID,
        rating: 0,
        comment: 'Calificación inválida',
      });
      const dtoHigh = plainToInstance(CreateReviewDto, {
        reviewedUserId: REVIEWED_ID,
        rating: 6,
        comment: 'Calificación inválida',
      });

      const errorsLow = await validate(dtoLow);
      const errorsHigh = await validate(dtoHigh);

      expect(errorsLow.length).toBeGreaterThan(0);
      expect(errorsHigh.length).toBeGreaterThan(0);
    });

    it('debe rechazar un reviewedUserId que no sea UUID v4', async () => {
      const dto = plainToInstance(CreateReviewDto, {
        reviewedUserId: 'invalid-uuid-123',
        rating: 4,
        comment: 'Comentario válido',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('debe rechazar un comentario vacío o que supere 1000 caracteres', async () => {
      const dtoEmpty = plainToInstance(CreateReviewDto, {
        reviewedUserId: REVIEWED_ID,
        rating: 4,
        comment: '',
      });
      const dtoLong = plainToInstance(CreateReviewDto, {
        reviewedUserId: REVIEWED_ID,
        rating: 4,
        comment: 'a'.repeat(1001),
      });

      const errorsEmpty = await validate(dtoEmpty);
      const errorsLong = await validate(dtoLong);

      expect(errorsEmpty.length).toBeGreaterThan(0);
      expect(errorsLong.length).toBeGreaterThan(0);
    });
  });

  describe('2. Reglas de Negocio (Estrategias de Elegibilidad)', () => {
    let mockGroupClient: any;
    let mockReviewsRepository: any;

    beforeEach(() => {
      mockGroupClient = {
        haveSharedGroup: asyncMock().mockResolvedValue(true),
      };

      mockReviewsRepository = {
        findActiveByPair: asyncMock().mockResolvedValue(null),
      };
    });

    it('NoSelfReviewRule: debe rechazar auto-reseña con 400 Bad Request', async () => {
      const rule = new NoSelfReviewRule();
      const violation = await rule.evaluate(REVIEWER_ID, REVIEWER_ID);

      expect(violation).not.toBeNull();
      expect(violation?.status).toBe(HttpStatus.BAD_REQUEST);
      expect(violation?.reason).toBe(REVIEW_MESSAGES.SELF_REVIEW);
    });

    it('NoSelfReviewRule: debe permitir reseña hacia otro estudiante', async () => {
      const rule = new NoSelfReviewRule();
      const violation = await rule.evaluate(REVIEWER_ID, REVIEWED_ID);

      expect(violation).toBeNull();
    });

    it('SharedGroupRule: debe rechazar con 403 Forbidden si no compartieron grupo', async () => {
      mockGroupClient.haveSharedGroup.mockResolvedValueOnce(false);
      const rule = new SharedGroupRule(mockGroupClient);

      const violation = await rule.evaluate(REVIEWER_ID, REVIEWED_ID);
      expect(violation).not.toBeNull();
      expect(violation?.status).toBe(HttpStatus.FORBIDDEN);
      expect(violation?.reason).toBe(REVIEW_MESSAGES.NO_SHARED_GROUP);
    });

    it('SharedGroupRule: debe permitir con null si compartieron grupo histórico', async () => {
      mockGroupClient.haveSharedGroup.mockResolvedValueOnce(true);
      const rule = new SharedGroupRule(mockGroupClient);

      const violation = await rule.evaluate(REVIEWER_ID, REVIEWED_ID);
      expect(violation).toBeNull();
    });

    it('UniqueReviewRule: debe rechazar con 409 Conflict si ya existe una reseña activa', async () => {
      mockReviewsRepository.findActiveByPair.mockResolvedValueOnce(sampleReview());
      const rule = new UniqueReviewRule(mockReviewsRepository);

      const violation = await rule.evaluate(REVIEWER_ID, REVIEWED_ID);
      expect(violation).not.toBeNull();
      expect(violation?.status).toBe(HttpStatus.CONFLICT);
      expect(violation?.reason).toBe(REVIEW_MESSAGES.ALREADY_REVIEWED);
    });
  });

  describe('3. ReviewsService (Casos de Uso)', () => {
    let service: ReviewsServiceImpl;
    let mockRepository: any;
    let mockModeration: any;
    let mockProfiles: any;
    let mockGroupClient: any;

    beforeEach(() => {
      mockRepository = {
        findById: asyncMock().mockResolvedValue(sampleReview()),
        findAll: asyncMock().mockResolvedValue([sampleReview()]),
        insert: asyncMock().mockImplementation(async (r: any) => ({ ...sampleReview(), ...r })),
        update: asyncMock().mockImplementation(async (r: any) => r),
        delete: asyncMock().mockResolvedValue(true),
        findActiveByPair: asyncMock().mockResolvedValue(null),
        findPublishedByReviewedUser: asyncMock().mockResolvedValue([sampleReview()]),
        findActiveByReviewer: asyncMock().mockResolvedValue([sampleReview()]),
      };

      mockModeration = {
        reviewWritten: jest.fn(),
      };

      mockProfiles = {
        findPeople: asyncMock().mockResolvedValue(
          new Map([
            [REVIEWER_ID, { id: REVIEWER_ID, name: 'Martín Vizcarra', profilePhotoUrl: 'https://photo.test/m.png' }],
            [REVIEWED_ID, { id: REVIEWED_ID, name: 'Carlos Mendoza', profilePhotoUrl: null }],
          ]),
        ),
      };

      mockGroupClient = {
        haveSharedGroup: asyncMock().mockResolvedValue(true),
      };

      const rules = [
        new NoSelfReviewRule(),
        new SharedGroupRule(mockGroupClient),
        new UniqueReviewRule(mockRepository),
      ];

      service = new ReviewsServiceImpl(mockRepository, mockModeration, mockProfiles, rules);
    });

    it('create(): debe crear la reseña, avisar a moderación y retornar DTO con autor', async () => {
      const payload: CreateReviewDto = {
        reviewedUserId: REVIEWED_ID,
        rating: 5,
        comment: 'Muy responsable y colaborativo',
      };

      const result = await service.create(REVIEWER_ID, payload);

      expect(mockRepository.insert).toHaveBeenCalledTimes(1);
      expect(mockModeration.reviewWritten).toHaveBeenCalledTimes(1);
      expect(result.rating).toBe(5);
      expect(result.reviewer.name).toBe('Martín Vizcarra');
    });

    it('getUserSummary(): debe calcular el promedio y total de reseñas publicadas', async () => {
      mockRepository.findPublishedByReviewedUser.mockResolvedValueOnce([
        sampleReview('r1', 5),
        sampleReview('r2', 4),
      ]);

      const summary = await service.getUserSummary(REVIEWED_ID);

      expect(summary.totalReviews).toBe(2);
      expect(summary.averageRating).toBe(4.5);
      expect(summary.reviews.length).toBe(2);
    });

    it('getUserSummary(): debe retornar averageRating = 0 si no hay reseñas', async () => {
      mockRepository.findPublishedByReviewedUser.mockResolvedValueOnce([]);

      const summary = await service.getUserSummary(REVIEWED_ID);

      expect(summary.totalReviews).toBe(0);
      expect(summary.averageRating).toBe(0);
      expect(summary.reviews).toEqual([]);
    });

    it('update(): debe permitir editar al autor y re-emitir moderación si cambia el comentario', async () => {
      const payload: UpdateReviewDto = {
        rating: 4,
        comment: 'Comentario editado',
      };

      const updated = await service.update('r1', payload, REVIEWER_ID);

      expect(mockRepository.update).toHaveBeenCalledTimes(1);
      expect(mockModeration.reviewWritten).toHaveBeenCalledTimes(1);
      expect(updated.rating).toBe(4);
    });

    it('update(): debe rechazar con 403 si un no-autor intenta editar la reseña', async () => {
      await expect(
        service.update('r1', { comment: 'Hack' }, OTHER_USER_ID),
      ).rejects.toThrow(ReviewException);
    });

    it('remove(): debe aplicar soft-delete si es solicitada por el autor', async () => {
      const result = await service.remove('r1', REVIEWER_ID);

      expect(mockRepository.delete).toHaveBeenCalledWith('r1');
      expect(result.deletedId).toBe('r1');
      expect(result.message).toBe(REVIEW_MESSAGES.DELETED);
    });

    it('remove(): debe rechazar con 403 si un no-autor intenta eliminar la reseña', async () => {
      await expect(service.remove('r1', OTHER_USER_ID)).rejects.toThrow(ReviewException);
    });
  });

  describe('4. ReviewsController (Seguridad y Metadatos)', () => {
    it('debe tener JwtAuthGuard en los endpoints protegidos (POST, GET /me, PUT, DELETE)', () => {
      const endpoints = ['create', 'getMyReviews', 'checkEligibility', 'update', 'remove'];

      for (const endpoint of endpoints) {
        const guards = Reflect.getMetadata(GUARDS_METADATA, ReviewsController.prototype[endpoint as keyof ReviewsController]);
        expect(guards).toBeDefined();
        expect(guards).toContain(JwtAuthGuard);
      }
    });
  });
});
