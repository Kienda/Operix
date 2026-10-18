import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DatabaseService } from '../platform/database.module';
import type { AuthenticatedRequest } from '../security/request-context';
import { RequirePermissions } from '../security/permissions.decorator';
import { assertBranch, recordWhere } from '../security/authorization';
import { haversineDistanceMeters, isWithinGeofence } from '../security/geo.util';

class GpsFixDto {
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsNumber() @Min(0) accuracyMeters!: number;
  @IsOptional() @IsString() selfieUrl?: string;
}

const DEFAULT_GEOFENCE_RADIUS_M = Number(process.env.DEFAULT_GEOFENCE_RADIUS_M ?? 150);
const GPS_MAX_ACCURACY_M = Number(process.env.GPS_MAX_ACCURACY_M ?? 100);

interface GeofenceData {
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
}
interface AttendanceData {
  checkIn: GpsFixDto & {
    capturedAt: string;
    geofenceResult: 'inside' | 'outside' | 'not_configured';
  };
  checkOut?: GpsFixDto & { capturedAt: string };
  durationMinutes?: number;
  flagReason?: string;
}

/**
 * GPS check-in/out for employees and security guards.
 *
 * An organization's active geofence for a branch is stored as a `BusinessRecord`
 * (module: `geofences`) rather than a dedicated table, matching the shared
 * pattern used for every other loosely-structured domain. Out-of-zone or
 * low-accuracy check-ins are accepted but left `PENDING` for a supervisor to
 * approve, rather than hard-rejected — a field worker should never be locked
 * out entirely by a bad GPS fix.
 */
@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Attaches the employee name and a resolved location to each shift so a
   * supervisor can answer "was this person actually on site?".
   *
   * The distance is recomputed here against the branch's current geofence
   * rather than reusing the verdict stored at check-in time: a geofence added
   * or moved after the fact should be reflected when the record is reviewed.
   */
  private async enrich(
    organizationId: string,
    records: Array<{
      createdBy: string;
      branchId: string | null;
      data: unknown;
      [key: string]: unknown;
    }>,
  ) {
    const userIds = [...new Set(records.map((record) => record.createdBy))];
    const users = await this.db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const names = new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`]));

    const branchIds = [
      ...new Set(
        records.map((record) => record.branchId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const fences = branchIds.length
      ? await this.db.businessRecord.findMany({
          where: {
            organizationId,
            module: 'geofences',
            branchId: { in: branchIds },
            archivedAt: null,
          },
        })
      : [];
    const fenceByBranch = new Map(fences.map((fence) => [fence.branchId as string, fence]));

    return records.map((record) => {
      const data = record.data as AttendanceData | null;
      const fence = record.branchId ? fenceByBranch.get(record.branchId) : undefined;
      const center = fence?.data as GeofenceData | undefined;
      const radiusMeters = center?.radiusMeters ?? DEFAULT_GEOFENCE_RADIUS_M;
      const hasCenter =
        typeof center?.latitude === 'number' && typeof center?.longitude === 'number';

      const locate = (fix?: {
        latitude?: number;
        longitude?: number;
        accuracyMeters?: number;
        capturedAt?: string;
      }) => {
        if (!fix || typeof fix.latitude !== 'number' || typeof fix.longitude !== 'number')
          return null;
        const base = {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracyMeters: fix.accuracyMeters ?? null,
          capturedAt: fix.capturedAt ?? null,
          site: fence?.name ?? null,
          radiusMeters: hasCenter ? radiusMeters : null,
        };
        if (!hasCenter) return { ...base, distanceMeters: null, inside: null };
        const distanceMeters = Math.round(
          haversineDistanceMeters(
            { latitude: fix.latitude, longitude: fix.longitude },
            { latitude: center!.latitude as number, longitude: center!.longitude as number },
          ),
        );
        return { ...base, distanceMeters, inside: distanceMeters <= radiusMeters };
      };

      return {
        ...record,
        employeeName: names.get(record.createdBy) ?? 'Unknown employee',
        location: { checkIn: locate(data?.checkIn), checkOut: locate(data?.checkOut) },
      };
    });
  }

  @RequirePermissions('attendance.check_in')
  @Post('check-in')
  async checkIn(@Body() body: GpsFixDto, @Req() r: AuthenticatedRequest) {
    const open = await this.db.businessRecord.findFirst({
      where: {
        organizationId: r.auth.organizationId,
        module: 'attendance',
        type: 'shift',
        createdBy: r.auth.userId,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
    });
    if (open)
      throw new BadRequestException('Already checked in — check out before starting a new shift');

    const branchId = r.auth.branchIds[0];
    assertBranch(r.auth, branchId);
    const geofence = branchId
      ? await this.db.businessRecord.findFirst({
          where: {
            organizationId: r.auth.organizationId,
            module: 'geofences',
            branchId,
            archivedAt: null,
          },
        })
      : null;

    let geofenceResult: 'inside' | 'outside' | 'not_configured' = 'not_configured';
    if (geofence) {
      const center = geofence.data as GeofenceData;
      if (typeof center.latitude === 'number' && typeof center.longitude === 'number') {
        const radius = center.radiusMeters ?? DEFAULT_GEOFENCE_RADIUS_M;
        geofenceResult = isWithinGeofence(
          body,
          { latitude: center.latitude, longitude: center.longitude },
          radius,
        )
          ? 'inside'
          : 'outside';
      }
    }

    const lowAccuracy = body.accuracyMeters > GPS_MAX_ACCURACY_M;
    const needsApproval = geofenceResult === 'outside' || lowAccuracy;
    const flagReason =
      geofenceResult === 'outside' && lowAccuracy
        ? 'Outside assigned geofence and low GPS accuracy'
        : geofenceResult === 'outside'
          ? 'Outside assigned geofence'
          : lowAccuracy
            ? `GPS accuracy ${body.accuracyMeters}m exceeds ${GPS_MAX_ACCURACY_M}m`
            : undefined;

    const data: AttendanceData = {
      checkIn: { ...body, capturedAt: new Date().toISOString(), geofenceResult },
      ...(flagReason ? { flagReason } : {}),
    };

    return this.db.businessRecord.create({
      data: {
        organizationId: r.auth.organizationId,
        branchId,
        module: 'attendance',
        type: 'shift',
        name: `Check-in ${new Date().toISOString()}`,
        status: needsApproval ? 'PENDING' : 'ACTIVE',
        data: data as never,
        createdBy: r.auth.userId,
        updatedBy: r.auth.userId,
      },
    });
  }

  @RequirePermissions('attendance.check_in')
  @Post(':id/check-out')
  async checkOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GpsFixDto,
    @Req() r: AuthenticatedRequest,
  ) {
    const record = await this.db.businessRecord.findFirst({
      where: {
        AND: [recordWhere(r.auth, 'attendance'), { id, type: 'shift', createdBy: r.auth.userId }],
      },
    });
    if (!record || record.archivedAt)
      throw new BadRequestException('No open shift found for this check-in');
    if (record.status === 'COMPLETED') throw new BadRequestException('Shift already checked out');

    const existing = record.data as unknown as AttendanceData;
    const checkInAt = new Date(existing.checkIn.capturedAt);
    const durationMinutes = Math.max(0, Math.round((Date.now() - checkInAt.getTime()) / 60000));
    const nextData: AttendanceData = {
      ...existing,
      checkOut: { ...body, capturedAt: new Date().toISOString() },
      durationMinutes,
    };

    return this.db.businessRecord.update({
      where: { id },
      data: {
        status: record.status === 'PENDING' ? 'PENDING' : 'COMPLETED',
        data: nextData as never,
        updatedBy: r.auth.userId,
      },
    });
  }

  /** A supervisor clears a flagged (out-of-geofence or low-accuracy) shift. */
  @RequirePermissions('attendance.approve')
  @Post(':id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    const record = await this.db.businessRecord.findFirst({
      where: { AND: [recordWhere(r.auth, 'attendance'), { id, type: 'shift', status: 'PENDING' }] },
    });
    if (!record) throw new BadRequestException('No pending attendance record found');
    const data = record.data as unknown as AttendanceData;
    return this.db.businessRecord.update({
      where: { id },
      data: {
        status: data.checkOut ? 'COMPLETED' : 'ACTIVE',
        data: { ...data, approvedBy: r.auth.userId, approvedAt: new Date().toISOString() } as never,
        updatedBy: r.auth.userId,
      },
    });
  }

  @RequirePermissions('attendance.view_own')
  @Get('mine')
  async myAttendance(@Req() r: AuthenticatedRequest) {
    const records = await this.db.businessRecord.findMany({
      where: {
        AND: [recordWhere(r.auth, 'attendance'), { type: 'shift', createdBy: r.auth.userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return this.enrich(r.auth.organizationId, records);
  }

  @RequirePermissions('attendance.view')
  @Get()
  async attendance(@Req() r: AuthenticatedRequest) {
    const records = await this.db.businessRecord.findMany({
      where: { ...recordWhere(r.auth, 'attendance'), type: 'shift' },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
    return this.enrich(r.auth.organizationId, records);
  }

  @RequirePermissions('attendance.view')
  @Get('pending')
  pending(@Req() r: AuthenticatedRequest) {
    return this.db.businessRecord.findMany({
      where: { ...recordWhere(r.auth, 'attendance'), type: 'shift', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
