import { z } from 'zod';

import {
  czechRankingCategorySchema,
  czechRankingTypeSchema,
  dateLikeSchema,
  eventDisciplineSchema,
  userRoleSchema,
} from './common.js';
import { systemMessageSeveritySchema } from './system-message.js';

export const adminDashboardSummarySchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  adminUsers: z.number().int().nonnegative(),
  totalEvents: z.number().int().nonnegative(),
  publishedEvents: z.number().int().nonnegative(),
  rankingEvents: z.number().int().nonnegative(),
  upcomingEvents: z.number().int().nonnegative(),
});

export const adminDashboardActivityPointSchema = z.object({
  monthStart: dateLikeSchema,
  usersCreated: z.number().int().nonnegative(),
  eventsCreated: z.number().int().nonnegative(),
});

export const adminUserListItemSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  firstname: z.string(),
  lastname: z.string(),
  role: userRoleSchema,
  organisation: z.string().nullable().optional(),
  active: z.boolean(),
  createdAt: dateLikeSchema,
});

export const adminEventListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  organizer: z.string().nullable().optional(),
  date: dateLikeSchema,
  discipline: eventDisciplineSchema,
  published: z.boolean(),
  ranking: z.boolean(),
  authorName: z.string().nullable().optional(),
  createdAt: dateLikeSchema,
});

export const adminDashboardSchema = z.object({
  summary: adminDashboardSummarySchema,
  monthlyActivity: z.array(adminDashboardActivityPointSchema),
  recentUsers: z.array(adminUserListItemSchema),
  recentEvents: z.array(adminEventListItemSchema),
});

export const adminUserListSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(adminUserListItemSchema),
});

export const adminUserActiveUpdateInputSchema = z.object({
  active: z.boolean(),
});

export const adminUserMutationResultSchema = z.object({
  user: adminUserListItemSchema,
});

export const adminEventListSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(adminEventListItemSchema),
});

const adminSystemMessageDateInputSchema = z.union([z.string(), z.date()]);

export const adminSystemMessageItemSchema = z.object({
  id: z.number().int(),
  title: z.string().nullable().optional(),
  message: z.string(),
  severity: systemMessageSeveritySchema,
  publishedAt: dateLikeSchema.nullable().optional(),
  expiresAt: dateLikeSchema.nullable().optional(),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

export const adminSystemMessageListSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(adminSystemMessageItemSchema),
});

export const adminSystemMessageUpsertInputSchema = z.object({
  title: z.string().trim().max(255).nullish(),
  message: z.string().trim().min(1).max(5000),
  severity: systemMessageSeveritySchema.default('INFO'),
  expiresAt: adminSystemMessageDateInputSchema.nullish(),
  published: z.boolean().default(false),
});

export const adminSystemMessageUpdateInputSchema = z
  .object({
    title: z.string().trim().max(255).nullish(),
    message: z.string().trim().min(1).max(5000).optional(),
    severity: systemMessageSeveritySchema.optional(),
    expiresAt: adminSystemMessageDateInputSchema.nullish(),
    published: z.boolean().optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const adminSystemMessageMutationResultSchema = z.object({
  systemMessage: adminSystemMessageItemSchema,
});

export const adminCzechRankingSnapshotDatasetSchema = z.object({
  rankingType: czechRankingTypeSchema,
  rankingCategory: czechRankingCategorySchema,
  validForMonth: dateLikeSchema,
  entriesCount: z.number().int().nonnegative(),
  updatedAt: dateLikeSchema,
  leaderName: z.string().nullable().optional(),
  leaderRegistration: z.string().nullable().optional(),
});

export const adminCzechRankingSnapshotEntrySchema = z.object({
  id: z.number().int(),
  rankingType: czechRankingTypeSchema,
  rankingCategory: czechRankingCategorySchema,
  validForMonth: dateLikeSchema,
  place: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  registration: z.string(),
  points: z.number().int(),
  rankIndex: z.number().int(),
  updatedAt: dateLikeSchema,
});

export const adminCzechRankingSnapshotDetailSchema = z.object({
  dataset: adminCzechRankingSnapshotDatasetSchema,
  items: z.array(adminCzechRankingSnapshotEntrySchema),
});

export const adminCzechRankingEventDatasetSchema = z.object({
  externalEventId: z.string(),
  localEventId: z.string().nullable().optional(),
  localEventName: z.string().nullable().optional(),
  eventDate: dateLikeSchema,
  rankingType: czechRankingTypeSchema,
  rankingCategory: czechRankingCategorySchema,
  resultCount: z.number().int().nonnegative(),
  syncedAt: dateLikeSchema,
});

export const adminCzechRankingEventEntrySchema = z.object({
  id: z.number().int(),
  externalEventId: z.string(),
  eventDate: dateLikeSchema,
  rankingType: czechRankingTypeSchema,
  rankingCategory: czechRankingCategorySchema,
  className: z.string(),
  competitorName: z.string().nullable().optional(),
  registration: z.string(),
  place: z.number().int().nullable().optional(),
  time: z.string().nullable().optional(),
  rankingPoints: z.number().int().nonnegative(),
  rankingReferenceValue: z.number().int().nullable().optional(),
  syncedAt: dateLikeSchema,
});

export const adminCzechRankingEventDetailSchema = z.object({
  dataset: adminCzechRankingEventDatasetSchema,
  items: z.array(adminCzechRankingEventEntrySchema),
});

export const adminCzechRankingOverviewSchema = z.object({
  summary: z.object({
    snapshotDatasetCount: z.number().int().nonnegative(),
    snapshotEntryCount: z.number().int().nonnegative(),
    eventDatasetCount: z.number().int().nonnegative(),
    eventResultCount: z.number().int().nonnegative(),
  }),
  snapshotDatasets: z.array(adminCzechRankingSnapshotDatasetSchema),
  eventResultDatasets: z.array(adminCzechRankingEventDatasetSchema),
});

export const adminCzechRankingSyncResultSchema = z.object({
  scope: z.enum(['FOREST', 'SPRINT', 'ALL']),
  syncedTypes: z.array(czechRankingTypeSchema),
  syncedEvents: z.number().int().nonnegative(),
  startedAt: dateLikeSchema,
  finishedAt: dateLikeSchema,
});

export const adminCzechRankingUploadResultSchema = z.object({
  rankingType: czechRankingTypeSchema,
  rankingCategory: czechRankingCategorySchema,
  validForMonth: dateLikeSchema,
  importedEntries: z.number().int().nonnegative(),
});

export const adminCzechRankingClearResultSchema = z.object({
  scope: z.enum(['SNAPSHOTS', 'EVENT_RESULTS']),
  deletedCount: z.number().int().nonnegative(),
});

export type AdminDashboardSummary = z.infer<typeof adminDashboardSummarySchema>;
export type AdminDashboardActivityPoint = z.infer<typeof adminDashboardActivityPointSchema>;
export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;
export type AdminEventListItem = z.infer<typeof adminEventListItemSchema>;
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
export type AdminUserList = z.infer<typeof adminUserListSchema>;
export type AdminUserActiveUpdateInput = z.infer<typeof adminUserActiveUpdateInputSchema>;
export type AdminUserMutationResult = z.infer<typeof adminUserMutationResultSchema>;
export type AdminEventList = z.infer<typeof adminEventListSchema>;
export type AdminSystemMessageItem = z.infer<typeof adminSystemMessageItemSchema>;
export type AdminSystemMessageList = z.infer<typeof adminSystemMessageListSchema>;
export type AdminSystemMessageUpsertInput = z.infer<typeof adminSystemMessageUpsertInputSchema>;
export type AdminSystemMessageUpdateInput = z.infer<typeof adminSystemMessageUpdateInputSchema>;
export type AdminSystemMessageMutationResult = z.infer<
  typeof adminSystemMessageMutationResultSchema
>;
export type AdminCzechRankingSnapshotDataset = z.infer<
  typeof adminCzechRankingSnapshotDatasetSchema
>;
export type AdminCzechRankingSnapshotEntry = z.infer<typeof adminCzechRankingSnapshotEntrySchema>;
export type AdminCzechRankingSnapshotDetail = z.infer<typeof adminCzechRankingSnapshotDetailSchema>;
export type AdminCzechRankingEventDataset = z.infer<typeof adminCzechRankingEventDatasetSchema>;
export type AdminCzechRankingEventEntry = z.infer<typeof adminCzechRankingEventEntrySchema>;
export type AdminCzechRankingEventDetail = z.infer<typeof adminCzechRankingEventDetailSchema>;
export type AdminCzechRankingOverview = z.infer<typeof adminCzechRankingOverviewSchema>;
export type AdminCzechRankingSyncResult = z.infer<typeof adminCzechRankingSyncResultSchema>;
export type AdminCzechRankingUploadResult = z.infer<typeof adminCzechRankingUploadResultSchema>;
export type AdminCzechRankingClearResult = z.infer<typeof adminCzechRankingClearResultSchema>;
