export const POST_TYPES = {
  STUDY_GROUP: 'study_group',
  TUTORING: 'tutoring',
} as const;

export type PostType = (typeof POST_TYPES)[keyof typeof POST_TYPES];

export const POST_STATUS = {
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
  DELETED: 'deleted',
} as const;

export const POST_MESSAGES = {
  COURSE_NOT_FOUND: 'Course not found',
  GROUP_NOT_FOUND: 'Specified group not found',
  POST_NOT_FOUND: 'Post not found',
  FORBIDDEN_EDIT: 'You do not have permission to edit this post',
  FORBIDDEN_DELETE: 'You do not have permission to delete this post',
  DELETED_SUCCESS: 'Post deleted successfully',
  UNSUPPORTED_TYPE: 'type must be tutoring or study_group',
} as const;

export const CONTENT_CREATED_EVENT = 'content.created';

