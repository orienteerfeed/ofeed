import {
  adminCzechRankingClearResultSchema,
  adminCzechRankingEventDetailSchema,
  adminCzechRankingOverviewSchema,
  adminCzechRankingSnapshotDetailSchema,
  adminCzechRankingSyncResultSchema,
  adminCzechRankingUploadResultSchema,
  adminDashboardSchema,
  adminEventListSchema,
  adminSystemMessageListSchema,
  adminSystemMessageMutationResultSchema,
  adminUserMutationResultSchema,
  adminUserListSchema,
  type AdminSystemMessageUpdateInput,
  type AdminSystemMessageUpsertInput,
  type CzechRankingCategory,
  type CzechRankingType,
} from '@repo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { config } from '@/config';
import { useApi } from '@/hooks/useApi';
import { useAuthForRequest } from '@/hooks/useAuth';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type {
  ApiResponse,
  SuccessApiResponse,
  ValidationApiResponse,
} from '@/types/api';

type SnapshotDetailParams = {
  rankingType: CzechRankingType;
  rankingCategory: CzechRankingCategory;
  validForMonth: string;
};

type EventDetailParams = {
  externalEventId: string;
  rankingType: CzechRankingType;
  rankingCategory: CzechRankingCategory;
};

type SnapshotUploadInput = SnapshotDetailParams & {
  file: File | Blob;
  fileName: string;
};

type SnapshotClearInput = Partial<SnapshotDetailParams>;

type EventResultsClearInput = Partial<EventDetailParams>;

async function handleApiResponse<T>(
  response: Response,
  logout: () => void
): Promise<T> {
  if (response.status === 401) {
    logout();
    throw new Error('Session expired. Please sign in again.');
  }

  const contentType = response.headers.get('content-type');
  let data: ApiResponse<T>;

  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = {} as ApiResponse<T>;
  }

  if (!response.ok) {
    const validationData = data as ValidationApiResponse;
    if (validationData.errors) {
      throw new Error(
        validationData.errors.map(err => `${err.msg}: ${err.param}`).join(', ')
      );
    }

    throw new Error(
      data.message || `Request failed with status ${response.status}`
    );
  }

  const successResponse = data as SuccessApiResponse<T>;
  return successResponse.results;
}

export function useAdminDashboardQuery() {
  const api = useApi();

  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () =>
      adminDashboardSchema.parse(await api.get(ENDPOINTS.adminDashboard())),
  });
}

export function useAdminUsersQuery() {
  const api = useApi();

  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () =>
      adminUserListSchema.parse(await api.get(ENDPOINTS.adminUsers())),
  });
}

export function useAdminUserActiveMutation() {
  const api = useApi();

  return useMutation({
    mutationFn: async (input: { userId: number; active: boolean }) =>
      adminUserMutationResultSchema.parse(
        await api.patch(ENDPOINTS.adminUser(input.userId), {
          active: input.active,
        })
      ),
  });
}

export function useAdminUserDeleteMutation() {
  const api = useApi();

  return useMutation({
    mutationFn: async (userId: number) =>
      adminUserMutationResultSchema.parse(
        await api.delete(ENDPOINTS.adminUser(userId))
      ),
  });
}

export function useAdminEventsQuery() {
  const api = useApi();

  return useQuery({
    queryKey: ['admin', 'events'],
    queryFn: async () =>
      adminEventListSchema.parse(await api.get(ENDPOINTS.adminEvents())),
  });
}

export function useAdminSystemMessagesQuery() {
  const api = useApi();

  return useQuery({
    queryKey: ['admin', 'system-messages'],
    queryFn: async () =>
      adminSystemMessageListSchema.parse(
        await api.get(ENDPOINTS.adminSystemMessages())
      ),
  });
}

export function useAdminSystemMessageCreateMutation() {
  const api = useApi();

  return useMutation({
    mutationFn: async (input: AdminSystemMessageUpsertInput) =>
      adminSystemMessageMutationResultSchema.parse(
        await api.post(ENDPOINTS.adminSystemMessages(), input)
      ),
  });
}

export function useAdminSystemMessageUpdateMutation() {
  const api = useApi();

  return useMutation({
    mutationFn: async (input: {
      messageId: number;
      data: AdminSystemMessageUpdateInput;
    }) =>
      adminSystemMessageMutationResultSchema.parse(
        await api.patch(
          ENDPOINTS.adminSystemMessage(input.messageId),
          input.data
        )
      ),
  });
}

export function useAdminSystemMessageDeleteMutation() {
  const api = useApi();

  return useMutation({
    mutationFn: async (messageId: number) =>
      adminSystemMessageMutationResultSchema.parse(
        await api.delete(ENDPOINTS.adminSystemMessage(messageId))
      ),
  });
}

export function useAdminCzechRankingOverviewQuery() {
  const api = useApi();

  return useQuery({
    queryKey: ['admin', 'czech-ranking', 'overview'],
    queryFn: async () =>
      adminCzechRankingOverviewSchema.parse(
        await api.get(ENDPOINTS.adminCzechRankingOverview())
      ),
  });
}

export function useAdminCzechRankingSnapshotDetailQuery(
  params: SnapshotDetailParams | null
) {
  const api = useApi();

  return useQuery({
    queryKey: ['admin', 'czech-ranking', 'snapshot-detail', params],
    enabled: params != null,
    queryFn: async () => {
      if (!params) {
        throw new Error('Snapshot detail parameters are required');
      }

      return adminCzechRankingSnapshotDetailSchema.parse(
        await api.get(
          ENDPOINTS.adminCzechRankingSnapshots({
            rankingType: params.rankingType,
            rankingCategory: params.rankingCategory,
            validForMonth: params.validForMonth,
          })
        )
      );
    },
  });
}

export function useAdminCzechRankingEventDetailQuery(
  params: EventDetailParams | null
) {
  const api = useApi();

  return useQuery({
    queryKey: ['admin', 'czech-ranking', 'event-detail', params],
    enabled: params != null,
    queryFn: async () => {
      if (!params) {
        throw new Error('Event detail parameters are required');
      }

      return adminCzechRankingEventDetailSchema.parse(
        await api.get(
          ENDPOINTS.adminCzechRankingEventResults({
            externalEventId: params.externalEventId,
            rankingType: params.rankingType,
            rankingCategory: params.rankingCategory,
          })
        )
      );
    },
  });
}

export function useAdminCzechRankingSnapshotUploadMutation() {
  const { token, logout } = useAuthForRequest();

  return useMutation({
    mutationFn: async (input: SnapshotUploadInput) => {
      const formData = new FormData();
      formData.append('rankingType', input.rankingType);
      formData.append('rankingCategory', input.rankingCategory);
      formData.append('validForMonth', input.validForMonth);
      formData.append('file', input.file, input.fileName);

      const requestInit: RequestInit = {
        method: 'POST',
        body: formData,
      };

      if (token) {
        requestInit.headers = {
          Authorization: `Bearer ${token}`,
        };
      }

      const response = await fetch(
        `${config.BASE_API_URL}${ENDPOINTS.adminCzechRankingSnapshots()}`,
        requestInit
      );

      return adminCzechRankingUploadResultSchema.parse(
        await handleApiResponse(response, logout)
      );
    },
  });
}

export function useAdminCzechRankingOrisSyncMutation() {
  const api = useApi();

  return useMutation({
    mutationFn: async (scope: 'ALL' | CzechRankingType) =>
      adminCzechRankingSyncResultSchema.parse(
        await api.post(ENDPOINTS.adminCzechRankingOrisSync(), { scope })
      ),
  });
}

export function useAdminCzechRankingClearSnapshotsMutation() {
  const api = useApi();

  return useMutation({
    mutationFn: async (filters?: SnapshotClearInput) =>
      adminCzechRankingClearResultSchema.parse(
        await api.delete(
          ENDPOINTS.adminCzechRankingSnapshots({
            rankingType: filters?.rankingType,
            rankingCategory: filters?.rankingCategory,
            validForMonth: filters?.validForMonth,
          })
        )
      ),
  });
}

export function useAdminCzechRankingClearEventResultsMutation() {
  const api = useApi();

  return useMutation({
    mutationFn: async (filters?: EventResultsClearInput) =>
      adminCzechRankingClearResultSchema.parse(
        await api.delete(
          ENDPOINTS.adminCzechRankingEventResults({
            externalEventId: filters?.externalEventId,
            rankingType: filters?.rankingType,
            rankingCategory: filters?.rankingCategory,
          })
        )
      ),
  });
}
