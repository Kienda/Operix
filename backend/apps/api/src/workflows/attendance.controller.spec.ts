import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceController } from './attendance.controller';
import type { AuthenticatedRequest } from '../security/request-context';

function makeRequest(branchIds: string[] = ['branch-1']): AuthenticatedRequest {
  return {
    auth: { userId: 'user-1', organizationId: 'org-1', sessionId: 's-1', permissions: [], branchIds },
  } as unknown as AuthenticatedRequest;
}

const insideFix = { latitude: 9.537, longitude: -13.6785, accuracyMeters: 10 };
const outsideFix = { latitude: 9.6, longitude: -13.6785, accuracyMeters: 10 };
const geofenceRecord = {
  data: { latitude: 9.537, longitude: -13.6785, radiusMeters: 150 },
};

describe('AttendanceController#checkIn', () => {
  it('rejects a second check-in while one is already open', async () => {
    const db = { businessRecord: { findFirst: vi.fn().mockResolvedValue({ id: 'existing' }) } };
    const controller = new AttendanceController(db as never);
    await expect(controller.checkIn(insideFix, makeRequest())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a shift ACTIVE when inside the geofence with good accuracy', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(geofenceRecord);
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const db = { businessRecord: { findFirst, create } };
    const controller = new AttendanceController(db as never);
    const result = await controller.checkIn(insideFix, makeRequest());
    expect(result.status).toBe('ACTIVE');
  });

  it('marks a shift PENDING when outside the geofence', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(geofenceRecord);
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const db = { businessRecord: { findFirst, create } };
    const controller = new AttendanceController(db as never);
    const result = await controller.checkIn(outsideFix, makeRequest());
    expect(result.status).toBe('PENDING');
    expect((result.data as { flagReason?: string }).flagReason).toMatch(/geofence/i);
  });

  it('marks a shift PENDING when GPS accuracy is too low even inside the geofence', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(geofenceRecord);
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const db = { businessRecord: { findFirst, create } };
    const controller = new AttendanceController(db as never);
    const result = await controller.checkIn({ ...insideFix, accuracyMeters: 500 }, makeRequest());
    expect(result.status).toBe('PENDING');
    expect((result.data as { flagReason?: string }).flagReason).toMatch(/accuracy/i);
  });

  it('accepts the check-in when no geofence is configured for the branch', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const db = { businessRecord: { findFirst, create } };
    const controller = new AttendanceController(db as never);
    const result = await controller.checkIn(insideFix, makeRequest());
    expect(result.status).toBe('ACTIVE');
  });
});
