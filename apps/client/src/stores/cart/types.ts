/** A single competitor entry waiting in the cart before checkout. */
export interface CartEntryItem {
  /** Local id (uuid) used for cart manipulation only. */
  id: string;
  eventId: string;
  eventName: string;
  currencyCode: string;
  classId: number;
  className: string;
  firstname: string;
  lastname: string;
  registration?: string;
  birthYear?: number;
  organisation?: string;
  license?: string;
  /** Optional note for the event organizer about this specific competitor. */
  note?: string;
  card?: number;
  cardRental: boolean;
  /** ISO start time; present only for slot-based start modes. */
  startTime?: string;
  /** Snapshot of the class fee at the time the item was added. */
  fee: number;
  /** Card rental price snapshot; null means rental is free. */
  cardRentalFee: number | null;
}

export interface CartState {
  items: CartEntryItem[];
}

export interface CartActions {
  addItem: (item: Omit<CartEntryItem, 'id'>) => void;
  removeItem: (id: string) => void;
  clearEvent: (eventId: string) => void;
  clear: () => void;
}

export type CartStore = CartState & CartActions;
