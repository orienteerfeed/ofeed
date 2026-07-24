import { gql } from '@apollo/client';
import type {
  EntryItemActionKey,
  EntryStatus,
  PaymentMethodType,
} from '@repo/shared';

export interface EntryOrderItemPreviousValue {
  card: number | null;
  startTime: string | null;
  firstname: string | null;
  lastname: string | null;
  className: string | null;
}

export interface EntryOrderItemRow {
  id: number;
  classId: number;
  firstname: string;
  lastname: string;
  registration: string | null;
  birthYear: number | null;
  organisation: string | null;
  license: string | null;
  note: string | null;
  card: number | null;
  cardRental: boolean;
  startTime: string | null;
  fee: number;
  cardRentalFee: number | null;
  competitorId: number | null;
  actionKey: EntryItemActionKey;
  previousValue: EntryOrderItemPreviousValue | null;
  class: {
    id: number;
    name: string;
  };
}

export interface EntryOrderRow {
  id: string;
  eventId: string;
  status: EntryStatus;
  paid: boolean;
  paymentMethod: PaymentMethodType | null;
  paymentReference: string;
  userId: number | null;
  contactEmail: string;
  contactFirstname: string;
  contactLastname: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  items: EntryOrderItemRow[];
}

export interface EntryOrdersByEventData {
  entryOrdersByEvent: EntryOrderRow[];
}

export interface EntryOrdersByEventVariables {
  eventId: string;
}

const ENTRY_ORDER_ITEM_FIELDS = gql`
  fragment EntryOrderItemFields on EntryItem {
    id
    classId
    firstname
    lastname
    registration
    birthYear
    organisation
    license
    note
    card
    cardRental
    startTime
    fee
    cardRentalFee
    competitorId
    actionKey
    previousValue {
      card
      startTime
      firstname
      lastname
      className
    }
    class {
      id
      name
    }
  }
`;

export const ENTRY_ORDERS_BY_EVENT = gql`
  query EntryOrdersByEvent($eventId: String!) {
    entryOrdersByEvent(eventId: $eventId) {
      id
      eventId
      status
      paid
      paymentMethod
      paymentReference
      userId
      contactEmail
      contactFirstname
      contactLastname
      totalAmount
      currency
      createdAt
      updatedAt
      items {
        ...EntryOrderItemFields
      }
    }
  }
  ${ENTRY_ORDER_ITEM_FIELDS}
`;

export interface EntryOrderAddOnItemRow {
  id: number;
  quantity: number;
  price: number;
  serviceName: string;
  serviceDescription: string | null;
}

export interface EntryOrderStatusHistoryRow {
  id: number;
  status: EntryStatus | null;
  paymentState: boolean | null;
  createdAt: string;
  changedByName: string | null;
}

export interface EntryOrderDetail extends EntryOrderRow {
  qrPayment: {
    payload: string;
    bankAccountIban: string;
    bankAccountName: string | null;
    amount: number;
    currency: string;
    paymentReference: string;
    constantSymbol: string;
    recipientMessage: string;
  } | null;
  addOnItems: EntryOrderAddOnItemRow[];
  statusHistory: EntryOrderStatusHistoryRow[];
  event: {
    id: string;
    name: string;
    date: string;
    organizer: string | null;
    vatPayer: boolean;
    vatRate: number | null;
  };
}

export interface EntryOrderByIdData {
  entryOrderById: EntryOrderDetail | null;
}

export interface EntryOrderByIdVariables {
  entryId: string;
  accessToken?: string;
}

export const ENTRY_ORDER_BY_ID = gql`
  query EntryOrderById($entryId: String!, $accessToken: String) {
    entryOrderById(entryId: $entryId, accessToken: $accessToken) {
      id
      eventId
      status
      paid
      paymentMethod
      paymentReference
      qrPayment {
        payload
        bankAccountIban
        bankAccountName
        amount
        currency
        paymentReference
        constantSymbol
        recipientMessage
      }
      userId
      contactEmail
      contactFirstname
      contactLastname
      totalAmount
      currency
      createdAt
      updatedAt
      items {
        ...EntryOrderItemFields
      }
      addOnItems {
        id
        quantity
        price
        serviceName
        serviceDescription
      }
      statusHistory {
        id
        status
        paymentState
        createdAt
        changedByName
      }
      event {
        id
        name
        date
        organizer
        vatPayer
        vatRate
      }
    }
  }
  ${ENTRY_ORDER_ITEM_FIELDS}
`;

export interface EntryOrderStatusUpdateResponse {
  entryOrderStatusUpdate: {
    id: string;
    status: EntryStatus;
  };
}

export interface EntryOrderStatusUpdateVariables {
  entryId: string;
  status: EntryStatus;
}

export const ENTRY_ORDER_STATUS_UPDATE = gql`
  mutation EntryOrderStatusUpdate($entryId: String!, $status: EntryStatus!) {
    entryOrderStatusUpdate(entryId: $entryId, status: $status) {
      id
      status
    }
  }
`;

export interface EntryOrderPaidUpdateResponse {
  entryOrderPaidUpdate: {
    id: string;
    paid: boolean;
  };
}

export interface EntryOrderPaidUpdateVariables {
  entryId: string;
  paid: boolean;
}

export const ENTRY_ORDER_PAID_UPDATE = gql`
  mutation EntryOrderPaidUpdate($entryId: String!, $paid: Boolean!) {
    entryOrderPaidUpdate(entryId: $entryId, paid: $paid) {
      id
      paid
    }
  }
`;

export interface EntryOrderProcessResponse {
  entryOrderProcess: {
    id: string;
    status: EntryStatus;
  };
}

export interface EntryOrderProcessVariables {
  entryId: string;
}

export const ENTRY_ORDER_PROCESS = gql`
  mutation EntryOrderProcess($entryId: String!) {
    entryOrderProcess(entryId: $entryId) {
      id
      status
    }
  }
`;

export interface AssignEntryItemRentalCardResponse {
  assignEntryItemRentalCard: {
    id: string;
    items: { id: number; card: number | null }[];
  };
}

export interface AssignEntryItemRentalCardVariables {
  entryItemId: number;
  cardNumber: number;
}

export const ASSIGN_ENTRY_ITEM_RENTAL_CARD = gql`
  mutation AssignEntryItemRentalCard($entryItemId: Int!, $cardNumber: Int!) {
    assignEntryItemRentalCard(
      entryItemId: $entryItemId
      cardNumber: $cardNumber
    ) {
      id
      items {
        id
        card
      }
    }
  }
`;

export interface AvailableRentalCard {
  id: number;
  cardNumber: number;
  active: boolean;
  returned: boolean;
  isLent: boolean;
}

export interface EntryItemsRentalCardOptionsData {
  eventRentalCards: AvailableRentalCard[];
}

export interface EntryItemsRentalCardOptionsVariables {
  eventId: string;
}

export const ENTRY_ITEMS_RENTAL_CARD_OPTIONS = gql`
  query EntryItemsRentalCardOptions($eventId: String!) {
    eventRentalCards(eventId: $eventId) {
      id
      cardNumber
      active
      returned
      isLent
    }
  }
`;
