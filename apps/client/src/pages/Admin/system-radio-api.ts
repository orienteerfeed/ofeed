import { gql } from '@apollo/client';
import type {
  SystemRadioDeviceInput,
  SystemRadioCollectionInput,
} from '@repo/shared';

export type SystemRadio = SystemRadioDeviceInput & {
  id: string;
  archived: boolean;
  eventId: string | null;
  eventName: string | null;
  eventDate: string | null;
  lastSeenAt: string | null;
  collectionState: string;
  collectionError: string | null;
};
export type SystemCollection = {
  eventId: string;
  timezone: string;
  settings: SystemRadioCollectionInput;
  state: string;
  until: string | null;
  error: string | null;
};
export const RADIO_FIELDS = `id name sourceType macAddress intervalSeconds brokerProfile meshtasticChannel archived eventId eventName eventDate lastSeenAt collectionState collectionError`;
const COLLECTION_FIELDS = `eventId timezone state until error settings { hours checkCode startCode finishCode }`;
export const SYSTEM_RADIOS = gql`query AdminSystemRadios { adminSystemRadios { devices { ${RADIO_FIELDS} } brokerProfiles available } }`;
export const RADIO_EVENTS = gql`
  query AdminSystemRadioEvents($search: String) {
    adminSystemRadioEvents(search: $search) {
      id
      name
      date
    }
  }
`;
export const RADIO_COLLECTION = gql`query AdminSystemRadioCollection($eventId: String!) { adminSystemRadioCollection(eventId: $eventId) { ${COLLECTION_FIELDS} } }`;
export const SAVE_RADIO = gql`mutation SaveSystemRadioDevice($id: String, $input: SystemRadioDeviceInput!) { saveSystemRadioDevice(id: $id, input: $input) { ${RADIO_FIELDS} } }`;
export const ASSIGN_RADIO = gql`mutation AssignSystemRadioDevice($id: String!, $eventId: String) { assignSystemRadioDevice(id: $id, eventId: $eventId) { ${RADIO_FIELDS} } }`;
export const ARCHIVE_RADIO = gql`mutation ArchiveSystemRadioDevice($id: String!, $archived: Boolean!) { archiveSystemRadioDevice(id: $id, archived: $archived) { ${RADIO_FIELDS} } }`;
export const SAVE_COLLECTION = gql`mutation SaveSystemRadioCollection($eventId: String!, $input: SystemRadioCollectionInput!) { saveSystemRadioCollection(eventId: $eventId, input: $input) { ${COLLECTION_FIELDS} } }`;
export const START_COLLECTION = gql`mutation StartSystemRadioCollection($eventId: String!, $input: SystemRadioCollectionInput!) { startSystemRadioCollection(eventId: $eventId, input: $input) { ${COLLECTION_FIELDS} } }`;
export const STOP_COLLECTION = gql`mutation StopSystemRadioCollection($eventId: String!) { stopSystemRadioCollection(eventId: $eventId) { ${COLLECTION_FIELDS} } }`;
