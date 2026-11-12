import { gql } from '@apollo/client';
import type { LiveMetrics, YarocSettings } from '@repo/shared';

export const FIELDS = `devices { id name sourceType revoked status macAddress intervalSeconds lastSeenAt lastPunchAt uploadState uploadBytes uploadCompletedAt uploadDurationMs batteryPercent gsmRsrpDbm gsmSnrDb loraRssiDbm loraSnrDb signalBars latitude longitude positionAt errorMessage } yarocSettings { hours checkCode startCode finishCode brokerProfile meshtasticChannel } yarocAvailable sessionUntil brokerProfiles monitoringStartedAt monitoringUntil sessionState sessionError`;
export const LIVE_STATUS = gql`query EventLiveStatus($eventId: String!) { eventLiveStatus(eventId: $eventId) { ${FIELDS} } }`;
export const UPDATES = gql`subscription EventLiveStatusChanged($eventId: String!) { eventLiveStatusChanged(eventId: $eventId) { ${FIELDS} } }`;
export const HISTORY = gql`
  query EventDeviceHistory(
    $eventId: String!
    $deviceId: String!
    $from: String!
    $to: String!
  ) {
    eventDeviceHistory(
      eventId: $eventId
      deviceId: $deviceId
      from: $from
      to: $to
    ) {
      samples {
        minute
        count
        maxGapMs
        batteryPercent
        gsmRsrpDbm
        gsmSnrDb
        loraRssiDbm
        loraSnrDb
      }
      outages {
        kind
        startedAt
        endedAt
      }
    }
  }
`;
export const REGISTER = gql`
  mutation RegisterLiveDevice(
    $eventId: String!
    $name: String!
    $sourceType: String!
    $macAddress: String
    $intervalSeconds: Int
  ) {
    registerLiveDevice(
      eventId: $eventId
      name: $name
      sourceType: $sourceType
      macAddress: $macAddress
      intervalSeconds: $intervalSeconds
    ) {
      deviceId
      token
    }
  }
`;
export const MONITOR = gql`
  mutation StartLiveMonitoring($eventId: String!, $hours: Int) {
    startLiveMonitoring(eventId: $eventId, hours: $hours)
  }
`;
export const START = gql`
  mutation StartYaroc(
    $eventId: String!
    $hours: Int
    $checkCode: Int!
    $startCode: Int!
    $finishCode: Int!
    $brokerProfile: String
    $meshtasticChannel: String
  ) {
    startYaroc(
      eventId: $eventId
      hours: $hours
      checkCode: $checkCode
      startCode: $startCode
      finishCode: $finishCode
      brokerProfile: $brokerProfile
      meshtasticChannel: $meshtasticChannel
    )
  }
`;
export const SAVE_SETTINGS = gql`
  mutation UpdateEventYarocSettings(
    $eventId: String!
    $hours: Int
    $checkCode: Int!
    $startCode: Int!
    $finishCode: Int!
    $brokerProfile: String
    $meshtasticChannel: String
  ) {
    updateEventYarocSettings(
      eventId: $eventId
      hours: $hours
      checkCode: $checkCode
      startCode: $startCode
      finishCode: $finishCode
      brokerProfile: $brokerProfile
      meshtasticChannel: $meshtasticChannel
    )
  }
`;
export const STOP = gql`
  mutation StopYaroc($eventId: String!) {
    stopYaroc(eventId: $eventId)
  }
`;
export const REVOKE = gql`
  mutation RevokeLiveDevice($eventId: String!, $deviceId: String!) {
    revokeLiveDevice(eventId: $eventId, deviceId: $deviceId)
  }
`;
export const INTERVAL = gql`
  mutation UpdateLiveDeviceInterval(
    $eventId: String!
    $deviceId: String!
    $intervalSeconds: Int!
  ) {
    updateLiveDeviceInterval(
      eventId: $eventId
      deviceId: $deviceId
      intervalSeconds: $intervalSeconds
    )
  }
`;
export const ROTATE = gql`
  mutation RotateLiveDeviceToken($eventId: String!, $deviceId: String!) {
    rotateLiveDeviceToken(eventId: $eventId, deviceId: $deviceId) {
      deviceId
      token
    }
  }
`;
export type Device = LiveMetrics & {
  revoked: boolean;
  id: string;
  name: string;
  sourceType: string;
  status: string;
  macAddress: string | null;
  intervalSeconds: number;
  lastSeenAt: string | null;
};
export type Status = {
  yarocAvailable: boolean;
  sessionUntil: string | null;
  yarocSettings: Omit<YarocSettings, 'meshtasticChannel'> & {
    meshtasticChannel: string | null;
  };
  brokerProfiles: string[];
  devices: Device[];
  monitoringStartedAt: string | null;
  monitoringUntil: string | null;
  sessionState: string;
  sessionError: string | null;
};
export type Sample = LiveMetrics & {
  minute: string;
  count: number;
  maxGapMs: number;
};
export type History = {
  samples: Sample[];
  outages: { kind: string; startedAt: string; endedAt: string | null }[];
};
