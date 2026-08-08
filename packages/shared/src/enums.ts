export const ReservationStatus = {
  DRAFT: 'draft',
  HOLD: 'hold',
  TENTATIVE: 'tentative',
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  WAITLISTED: 'waitlisted',
} as const;

export type ReservationStatus =
  (typeof ReservationStatus)[keyof typeof ReservationStatus];

export const RoomStatus = {
  VACANT_CLEAN: 'vacant_clean',
  RESERVED: 'reserved',
  OCCUPIED: 'occupied',
  VACANT_DIRTY: 'vacant_dirty',
  CLEANING: 'cleaning',
  INSPECTION: 'inspection',
  OOO: 'ooo',
  OOS: 'oos',
} as const;

export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

export const HkTaskStatus = {
  UNASSIGNED: 'unassigned',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  INSPECTION_PENDING: 'inspection_pending',
  PASSED: 'passed',
  FAILED: 'failed',
  REWORK: 'rework',
} as const;

export type HkTaskStatus = (typeof HkTaskStatus)[keyof typeof HkTaskStatus];

export const FolioStatus = {
  OPEN: 'open',
  PARTIALLY_SETTLED: 'partially_settled',
  SETTLED: 'settled',
  CLOSED: 'closed',
} as const;

export type FolioStatus = (typeof FolioStatus)[keyof typeof FolioStatus];

export const ChannelStatus = {
  NOT_CONFIGURED: 'not_configured',
  AWAITING_AUTHORISATION: 'awaiting_authorisation',
  MAPPING: 'mapping',
  SYNC_TESTING: 'sync_testing',
  ACTIVE: 'active',
  DEGRADED: 'degraded',
  SUSPENDED: 'suspended',
} as const;

export type ChannelStatus = (typeof ChannelStatus)[keyof typeof ChannelStatus];

export const BookingSource = {
  DIRECT: 'direct',
  WALK_IN: 'walk_in',
  OTA: 'ota',
  CORPORATE: 'corporate',
  AGENT: 'agent',
  GROUP: 'group',
} as const;

export type BookingSource = (typeof BookingSource)[keyof typeof BookingSource];
