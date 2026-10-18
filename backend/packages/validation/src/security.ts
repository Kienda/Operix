import { z } from 'zod';
import { longText, mediumText, shortText, uuid } from './common';

/**
 * Geofences are either a circle (centre + radius) or a polygon. Both are
 * evaluated in PostGIS, never in the client.
 */
export const geofenceSchema = z
  .object({
    name: shortText,
    branchId: uuid.nullish(),
    kind: z.enum(['circle', 'polygon']).default('circle'),
    centerLatitude: z.coerce.number().min(-90).max(90).nullish(),
    centerLongitude: z.coerce.number().min(-180).max(180).nullish(),
    radiusMeters: z.coerce.number().int().min(10).max(50_000).nullish(),
    polygon: z
      .array(
        z.object({
          latitude: z.coerce.number().min(-90).max(90),
          longitude: z.coerce.number().min(-180).max(180),
        }),
      )
      .min(3)
      .max(500)
      .nullish(),
    address: mediumText.optional(),
    outsideBehaviour: z.enum(['reject', 'flag', 'require_approval']).default('require_approval'),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'circle') {
      if (v.centerLatitude == null || v.centerLongitude == null || v.radiusMeters == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['radiusMeters'],
          message: 'A circular geofence needs a centre and a radius',
        });
      }
    } else if (!v.polygon || v.polygon.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['polygon'],
        message: 'A polygon geofence needs at least three points',
      });
    }
  });

export const guardAssignmentSchema = z.object({
  employeeId: uuid,
  geofenceId: uuid.nullish(),
  branchId: uuid.nullish(),
  patrolRouteId: uuid.nullish(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  notes: mediumText.optional(),
});

export const patrolRouteSchema = z.object({
  name: shortText,
  branchId: uuid.nullish(),
  description: mediumText.optional(),
  expectedDurationMinutes: z.coerce.number().int().min(1).max(1440).default(60),
  /** How often the route must be completed during a shift. */
  frequencyPerShift: z.coerce.number().int().min(1).max(48).default(1),
  isActive: z.boolean().default(true),
  checkpoints: z
    .array(
      z.object({
        name: shortText,
        sortOrder: z.coerce.number().int().min(0),
        latitude: z.coerce.number().min(-90).max(90).nullish(),
        longitude: z.coerce.number().min(-180).max(180).nullish(),
        radiusMeters: z.coerce.number().int().min(5).max(1000).default(30),
        verificationMethods: z
          .array(z.enum(['qr', 'gps', 'photo', 'manual', 'nfc']))
          .min(1)
          .default(['qr']),
        /** Minutes after route start by which this checkpoint should be reached. */
        expectedOffsetMinutes: z.coerce.number().int().min(0).max(1440).nullish(),
        instructions: mediumText.optional(),
      }),
    )
    .min(1)
    .max(200),
});
export const updatePatrolRouteSchema = patrolRouteSchema.partial();

export const startPatrolSchema = z.object({
  routeId: uuid,
  shiftId: uuid.nullish(),
  deviceTime: z.coerce.date(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  accuracyMeters: z.coerce.number().min(0).max(10_000).nullish(),
  syncKey: z.string().trim().min(8).max(128).optional(),
});

export const checkpointScanSchema = z.object({
  checkpointId: uuid,
  method: z.enum(['qr', 'gps', 'photo', 'manual', 'nfc']),
  /** Signed token embedded in the checkpoint QR; verified server-side. */
  scannedCode: z.string().trim().max(512).optional(),
  deviceTime: z.coerce.date(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  accuracyMeters: z.coerce.number().min(0).max(10_000).nullish(),
  photoDocumentIds: z.array(uuid).max(10).default([]),
  notes: mediumText.optional(),
  syncKey: z.string().trim().min(8).max(128).optional(),
  capturedOffline: z.boolean().default(false),
});

export const endPatrolSchema = z.object({
  deviceTime: z.coerce.date(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  notes: mediumText.optional(),
  syncKey: z.string().trim().min(8).max(128).optional(),
});

export const INCIDENT_CATEGORIES = [
  'unauthorized_access',
  'theft',
  'fire',
  'medical_emergency',
  'equipment_damage',
  'suspicious_activity',
  'vehicle_accident',
  'visitor_issue',
  'safety_issue',
  'other',
] as const;

export const incidentSchema = z.object({
  title: shortText,
  description: longText,
  category: z.enum(INCIDENT_CATEGORIES),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  occurredAt: z.coerce.date(),
  branchId: uuid.nullish(),
  geofenceId: uuid.nullish(),
  patrolSessionId: uuid.nullish(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  locationDescription: mediumText.optional(),
  attachmentDocumentIds: z.array(uuid).max(30).default([]),
  syncKey: z.string().trim().min(8).max(128).optional(),
  capturedOffline: z.boolean().default(false),
});

export const incidentUpdateSchema = z.object({
  status: z
    .enum(['open', 'acknowledged', 'investigating', 'resolved', 'closed', 'escalated'])
    .optional(),
  assignedUserId: uuid.nullish(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  resolution: longText.optional(),
  followUpAt: z.coerce.date().nullish(),
  comment: mediumText.optional(),
  attachmentDocumentIds: z.array(uuid).max(30).default([]),
});

export const visitorSchema = z.object({
  fullName: shortText,
  phone: z.string().trim().max(24).nullish(),
  company: shortText.nullish(),
  hostEmployeeId: uuid.nullish(),
  branchId: uuid.nullish(),
  reason: mediumText,
  idType: z.enum(['national_id', 'passport', 'driver_license', 'company_badge', 'other']).nullish(),
  idNumber: z.string().trim().max(64).nullish(),
  photoDocumentId: uuid.nullish(),
  vehiclePlate: z.string().trim().max(24).nullish(),
  badgeNumber: z.string().trim().max(24).nullish(),
  expectedExitAt: z.coerce.date().nullish(),
  syncKey: z.string().trim().min(8).max(128).optional(),
});

export const visitorExitSchema = z.object({
  exitedAt: z.coerce.date().default(() => new Date()),
  badgeReturned: z.boolean().default(true),
  notes: mediumText.optional(),
});

export const sosSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  accuracyMeters: z.coerce.number().min(0).max(10_000).nullish(),
  deviceTime: z.coerce.date(),
  message: mediumText.optional(),
  syncKey: z.string().trim().min(8).max(128).optional(),
});

export const sosResponseSchema = z.object({
  action: z.enum(['acknowledge', 'resolve', 'false_alarm']),
  note: mediumText.optional(),
});

/**
 * Mobile offline queue. The client replays captured actions in order; each
 * carries a sync key so a retry can never double-apply.
 */
export const offlineBatchSchema = z.object({
  operations: z
    .array(
      z.object({
        syncKey: z.string().trim().min(8).max(128),
        entity: z.enum([
          'attendance.check_in',
          'attendance.check_out',
          'attendance.break',
          'patrol.start',
          'patrol.scan',
          'patrol.end',
          'incident.create',
          'visitor.register',
          'visitor.exit',
          'sos.trigger',
          'work_order.status',
          'waste.report',
        ]),
        capturedAt: z.coerce.date(),
        payload: z.record(z.unknown()),
      }),
    )
    .min(1)
    .max(200),
});
