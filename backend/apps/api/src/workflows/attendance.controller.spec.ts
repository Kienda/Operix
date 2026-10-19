import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceController } from './attendance.controller';
import type { AuthenticatedRequest } from '../security/request-context';

function makeRequest(branchIds: string[] = ['branch-1']): AuthenticatedRequest {
  return {
    auth: {
      userId: 'user-1',
      organizationId: 'org-1',
      sessionId: 's-1',
      permissions: [],
      branchIds,
    },
  } as unknown as AuthenticatedRequest;
}

const insideFix = { latitude: 9.537, longitude: -13.6785, accuracyMeters: 10 };
const outsideFix = { latitude: 9.6, longitude: -13.6785, accuracyMeters: 10 };
const geofenceRecord = {
  data: { latitude: 9.537, longitude: -13.6785, radiusMeters: 150 },
};

describe('AttendanceController#checkIn', () => {
  it('allows a new shift when the previous pending shift already has a checkout', async () => {
    const db = {
      businessRecord: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { status: 'PENDING', data: { checkOut: { capturedAt: new Date().toISOString() } } },
          ]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    const result = await new AttendanceController(db as never).checkIn(insideFix, makeRequest());
    expect(result.status).toBe('ACTIVE');
  });
  it('rejects a second check-in while one is already open', async () => {
    const db = {
      businessRecord: { findMany: vi.fn().mockResolvedValue([{ id: 'existing', data: {} }]) },
    };
    const controller = new AttendanceController(db as never);
    await expect(controller.checkIn(insideFix, makeRequest())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('marks a shift ACTIVE when inside the geofence with good accuracy', async () => {
    const findFirst = vi.fn().mockResolvedValue(geofenceRecord);
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const db = { businessRecord: { findMany: vi.fn().mockResolvedValue([]), findFirst, create } };
    const controller = new AttendanceController(db as never);
    const result = await controller.checkIn(insideFix, makeRequest());
    expect(result.status).toBe('ACTIVE');
  });

  it('marks a shift PENDING when outside the geofence', async () => {
    const findFirst = vi.fn().mockResolvedValue(geofenceRecord);
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const db = { businessRecord: { findMany: vi.fn().mockResolvedValue([]), findFirst, create } };
    const controller = new AttendanceController(db as never);
    const result = await controller.checkIn(outsideFix, makeRequest());
    expect(result.status).toBe('PENDING');
    expect((result.data as { flagReason?: string }).flagReason).toMatch(/geofence/i);
  });

  it('marks a shift PENDING when GPS accuracy is too low even inside the geofence', async () => {
    const findFirst = vi.fn().mockResolvedValue(geofenceRecord);
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const db = { businessRecord: { findMany: vi.fn().mockResolvedValue([]), findFirst, create } };
    const controller = new AttendanceController(db as never);
    const result = await controller.checkIn({ ...insideFix, accuracyMeters: 500 }, makeRequest());
    expect(result.status).toBe('PENDING');
    expect((result.data as { flagReason?: string }).flagReason).toMatch(/accuracy/i);
  });

  it('accepts the check-in when no geofence is configured for the branch', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const db = { businessRecord: { findMany: vi.fn().mockResolvedValue([]), findFirst, create } };
    const controller = new AttendanceController(db as never);
    const result = await controller.checkIn(insideFix, makeRequest());
    expect(result.status).toBe('ACTIVE');
  });
});

describe('AttendanceController#checkOut', () => {
  const record = {
    id: 'shift-1',
    status: 'PENDING',
    archivedAt: null,
    data: { checkIn: { capturedAt: new Date().toISOString() } },
  };
  it('rejects repeated checkout even while a shift awaits review', async () => {
    const updateManyAndReturn = vi.fn();
    const db = {
      businessRecord: {
        findFirst: vi.fn().mockResolvedValue({
          ...record,
          data: { ...record.data, checkOut: { capturedAt: new Date().toISOString() } },
        }),
        updateManyAndReturn,
      },
    };
    await expect(
      new AttendanceController(db as never).checkOut('shift-1', insideFix, makeRequest()),
    ).rejects.toThrow('already checked out');
    expect(updateManyAndReturn).not.toHaveBeenCalled();
  });
  it('allows only one concurrent checkout to claim the original state', async () => {
    const updateManyAndReturn = vi.fn().mockResolvedValueOnce([record]).mockResolvedValueOnce([]);
    const db = {
      businessRecord: { findFirst: vi.fn().mockResolvedValue(record), updateManyAndReturn },
    };
    const controller = new AttendanceController(db as never);
    const results = await Promise.allSettled(
      [1, 2].map(() => controller.checkOut('shift-1', insideFix, makeRequest())),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'shift-1',
          organizationId: 'org-1',
          createdBy: 'user-1',
          data: { equals: record.data },
        },
      }),
    );
  });
});
