import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsController } from './projects.controller';
import type { AuthenticatedRequest } from '../security/request-context';

function makeRequest(permissions: string[] = []): AuthenticatedRequest {
  return {
    auth: {
      userId: 'user-1',
      organizationId: 'org-1',
      sessionId: 's-1',
      permissions,
      branchIds: [],
    },
  } as unknown as AuthenticatedRequest;
}

function controllerFor(db: object) {
  return new ProjectsController({
    ...db,
    $transaction: (work: (tx: object) => unknown) => work(db),
  } as never);
}

describe('ProjectsController#start — contract gating', () => {
  it('throws NotFoundException when the project does not belong to the tenant', async () => {
    const db = { businessRecord: { findFirst: vi.fn().mockResolvedValue(null) } };
    const controller = controllerFor(db);
    await expect(controller.start('missing', {}, makeRequest())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows starting a project with no contract requirement', async () => {
    const project = {
      id: 'p1',
      status: 'DRAFT',
      branchId: null,
      data: { contractRequirement: 'not_required' },
    };
    const update = vi.fn().mockResolvedValue({ ...project, status: 'IN_PROGRESS' });
    const db = {
      businessRecord: { findFirst: vi.fn().mockResolvedValue(project), update },
      auditLog: { create: vi.fn() },
    };
    const controller = controllerFor(db);
    await controller.start('p1', {}, makeRequest());
    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'IN_PROGRESS', updatedBy: 'user-1' },
    });
  });

  it('blocks starting a project that requires a contract when none is fully executed', async () => {
    const project = {
      id: 'p1',
      status: 'DRAFT',
      branchId: null,
      data: { contractRequirement: 'before_work_starts' },
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(project) // project lookup
      .mockResolvedValueOnce(null); // no completed contract
    const db = { businessRecord: { findFirst }, auditLog: { create: vi.fn() } };
    const controller = controllerFor(db);
    await expect(controller.start('p1', {}, makeRequest())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('starts the project once a fully executed contract is linked', async () => {
    const project = {
      id: 'p1',
      status: 'DRAFT',
      branchId: null,
      data: { contractRequirement: 'before_work_starts' },
    };
    const contract = { id: 'c1', status: 'COMPLETED' };
    const findFirst = vi.fn().mockResolvedValueOnce(project).mockResolvedValueOnce(contract);
    const update = vi.fn().mockResolvedValue({ ...project, status: 'IN_PROGRESS' });
    const db = { businessRecord: { findFirst, update }, auditLog: { create: vi.fn() } };
    const controller = controllerFor(db);
    await controller.start('p1', {}, makeRequest());
    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'IN_PROGRESS', updatedBy: 'user-1' },
    });
  });

  it('rejects an override reason from a user without contracts.override_gate', async () => {
    const project = {
      id: 'p1',
      status: 'DRAFT',
      branchId: null,
      data: { contractRequirement: 'before_work_starts' },
    };
    const findFirst = vi.fn().mockResolvedValueOnce(project).mockResolvedValueOnce(null);
    const db = { businessRecord: { findFirst }, auditLog: { create: vi.fn() } };
    const controller = controllerFor(db);
    const request = makeRequest([]); // no override permission
    await expect(
      controller.start(
        'p1',
        { overrideReason: 'Customer verbally confirmed, contract pending' },
        request,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts an authorized override and writes an audit log entry', async () => {
    const project = {
      id: 'p1',
      status: 'DRAFT',
      branchId: null,
      data: { contractRequirement: 'before_work_starts' },
    };
    const findFirst = vi.fn().mockResolvedValueOnce(project).mockResolvedValueOnce(null);
    const update = vi.fn().mockResolvedValue({ ...project, status: 'IN_PROGRESS' });
    const auditCreate = vi.fn().mockResolvedValue({});
    const db = { businessRecord: { findFirst, update }, auditLog: { create: auditCreate } };
    const controller = controllerFor(db);
    const request = makeRequest(['contracts.override_gate']);
    await controller.start(
      'p1',
      { overrideReason: 'Customer verbally confirmed, contract pending' },
      request,
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CONTRACT_GATE_OVERRIDE', resourceId: 'p1' }),
      }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'IN_PROGRESS', updatedBy: 'user-1' },
    });
  });
});
