import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  tenantSlug: z.string().min(1).default('demo'),
});

export const AvailabilitySearchSchema = z.object({
  propertyId: z.string(),
  arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  rooms: z.number().int().min(1).default(1),
});

export const CreateReservationSchema = z.object({
  propertyId: z.string(),
  source: z.string().default('direct'),
  arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  roomProductId: z.string(),
  ratePlanId: z.string(),
  guest: z.object({
    fullName: z.string().min(1),
    mobile: z.string().optional(),
    email: z.string().email().optional(),
  }),
  notes: z.string().optional(),
  confirm: z.boolean().default(true),
});

export const CheckInSchema = z.object({
  roomId: z.string(),
  depositAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export const CheckOutSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'upi', 'bank', 'city_ledger']).optional(),
  paymentAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type AvailabilitySearchInput = z.infer<typeof AvailabilitySearchSchema>;
export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
export type CheckInInput = z.infer<typeof CheckInSchema>;
export type CheckOutInput = z.infer<typeof CheckOutSchema>;

/** sellable = base - confirmed - blocks - holds - ooo + overbooking */
export function computeSellable(day: {
  baseCapacity: number;
  confirmedRoomNights: number;
  activeGroupBlocks: number;
  activeHolds: number;
  outOfOrderOrService: number;
  authorisedOverbooking: number;
}): number {
  return (
    day.baseCapacity -
    day.confirmedRoomNights -
    day.activeGroupBlocks -
    day.activeHolds -
    day.outOfOrderOrService +
    day.authorisedOverbooking
  );
}
