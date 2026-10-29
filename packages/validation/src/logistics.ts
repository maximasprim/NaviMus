import { z } from "zod";
import { currencySchema, isoDateSchema, uuidSchema } from "./common.js";

const vehicleTypeCodeSchema = z.enum([
  "private_car",
  "suv",
  "van",
  "minibus",
  "tour_bus",
  "train",
  "domestic_flight",
  "international_flight",
  "boat",
  "ferry",
  "motorbike",
  "4x4_safari_vehicle",
  "self_drive",
]);

export const createTransportRouteSchema = z.object({
  originCityId: uuidSchema,
  destinationCityId: uuidSchema,
  vehicleTypeId: uuidSchema,
  basePrice: z.number().nonnegative(),
  currency: currencySchema,
  estimatedDurationMinutes: z.number().int().positive().optional(),
});
export type CreateTransportRouteInput = z.infer<typeof createTransportRouteSchema>;

export const createVehicleSchema = z.object({
  vehicleTypeId: uuidSchema,
  name: z.string().max(150).optional(),
  registrationNumber: z.string().max(30).optional(),
  capacity: z.number().int().positive(),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const transportRouteSearchSchema = z.object({
  originCityId: uuidSchema.optional(),
  destinationCityId: uuidSchema.optional(),
  vehicleType: vehicleTypeCodeSchema.optional(),
});

export const bookTransportSchema = z.object({
  transportRouteId: uuidSchema,
  vehicleId: uuidSchema.optional(),
  travelDate: isoDateSchema,
  passengerCount: z.number().int().min(1).default(1),
});
export type BookTransportInput = z.infer<typeof bookTransportSchema>;

// --- Airport transfers ---

export const createTransferLocationSchema = z.object({
  cityId: uuidSchema,
  name: z.string().min(2).max(200),
  type: z.enum(["airport", "hotel", "address"]).default("airport"),
  address: z.string().max(500).optional(),
});
export type CreateTransferLocationInput = z.infer<typeof createTransferLocationSchema>;

export const createAirportTransferSchema = z.object({
  pickupLocationId: uuidSchema,
  dropoffLocationId: uuidSchema,
  transferType: z.enum(["private", "shared"]).default("private"),
  direction: z.enum(["one_way", "return"]).default("one_way"),
  basePrice: z.number().nonnegative(),
  currency: currencySchema,
  meetAndGreet: z.boolean().default(false),
});
export type CreateAirportTransferInput = z.infer<typeof createAirportTransferSchema>;

export const bookAirportTransferSchema = z.object({
  airportTransferId: uuidSchema,
  transferDate: isoDateSchema,
  transferTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  passengerCount: z.number().int().min(1).default(1),
  luggageCount: z.number().int().min(0).default(0),
  childSeatsRequired: z.number().int().min(0).default(0),
  flightNumber: z.string().max(20).optional(),
});
export type BookAirportTransferInput = z.infer<typeof bookAirportTransferSchema>;
