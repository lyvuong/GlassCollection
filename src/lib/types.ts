export type Role = 'owner' | 'editor' | 'helper';
export type StopStatus = 'pending' | 'collected' | 'nothing_out' | 'skipped';
export type PayRuleType = 'perDay' | 'perStop' | 'hourly';
export type EmailFrequency = 'pickup' | 'monthly' | 'statementOnly';

export interface Member {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  routeIds: string[];
  payRule?: { type: PayRuleType; rate: number };
}

export interface Invite {
  email: string;
  role: Role;
  routeIds: string[];
  invitedBy?: string;
}

export interface Settings {
  businessName: string;
  defaultFee: number;
  currency: string;
  statementFooter: string;
  paymentInstructions: string;
  expenseCategories: string[];
  reportingThreshold: number;
  mileageRate: number;
  photoRetentionDays: number;
  emailSubject: string;
  emailIntro: string;
  contactEmail: string;
}

export const DEFAULT_SETTINGS: Settings = {
  businessName: 'Glass Pickup',
  defaultFee: 20,
  currency: 'USD',
  statementFooter: 'Thank you for recycling with us!',
  paymentInstructions: 'Please pay by cash, check, or Venmo.',
  expenseCategories: ['Fuel', 'Recycling center fees', 'Supplies', 'Vehicle maintenance', 'Equipment', 'Phone/software', 'Other'],
  reportingThreshold: 600,
  mileageRate: 0.7,
  photoRetentionDays: 90,
  emailSubject: 'Your glass pickup on {{date}}',
  emailIntro: 'Hi {{name}}, here is the summary of today\'s glass pickup.',
  contactEmail: '',
};

export interface Neighborhood {
  id: string;
  name: string;
  homeAddress: string;
  homeLat?: number;
  homeLng?: number;
  centerAddress: string;
  centerLat?: number;
  centerLng?: number;
  monthlyFee: number;
  photoRequiredFor: StopStatus[];
  notes: string;
}

export interface RouteDoc {
  id: string;
  neighborhoodId: string;
  name: string;
  color: string;
  order: number;
}

export interface MonthRange {
  from: string; // YYYY-MM
  to?: string; // YYYY-MM inclusive; open ended when missing
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  phone: string;
  email: string;
  notes: string;
  neighborhoodId: string;
  routeId: string;
  startDate: string; // YYYY-MM-DD
  pauses: MonthRange[];
  monthlyFee: number;
  emailOptIn: boolean;
  emailFrequency: EmailFrequency;
}

export interface CollectionRoute {
  assigneeUid?: string;
  order: string[];
  plannedDistance?: number;
  plannedDuration?: number;
}

export interface Collection {
  id: string;
  date: string; // YYYY-MM-DD
  neighborhoodId: string;
  routeIds: string[];
  routes: Record<string, CollectionRoute>;
  status: 'open' | 'closed';
  createdAt?: number;
}

export interface Stop {
  id: string; // customerId
  routeId: string;
  status: StopStatus;
  note: string;
  checkedAt?: number;
  checkedBy?: string;
  checkedLat?: number;
  checkedLng?: number;
  accuracy?: number;
}

export interface PhotoDoc {
  id: string;
  jpegBase64: string;
  width: number;
  height: number;
  takenAt: number;
  lat?: number;
  lng?: number;
  accuracy?: number;
  takenBy: string;
}

export interface Payment {
  id: string;
  customerId: string;
  month: string; // YYYY-MM the payment applies to
  amount: number;
  method: string;
  receivedDate: string; // YYYY-MM-DD
}

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string;
  neighborhoodId?: string;
  payee: string;
  note: string;
  receiptRef: string;
}

export interface Payout {
  id: string;
  memberUid: string;
  date: string;
  amount: number;
  method: string;
  collectionId?: string;
  basis: PayRuleType | 'manual';
  note: string;
}

export interface EmailLog {
  id: string;
  customerId: string;
  kind: 'pickupNotice' | 'statement';
  collectionId?: string;
  month?: string;
  to: string;
  subject: string;
  status: 'queued' | 'sent' | 'failed';
  error?: string;
  sentAt?: number;
  sentBy?: string;
}
