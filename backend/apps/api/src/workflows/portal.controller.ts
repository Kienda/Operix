import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { DatabaseService } from '../platform/database.module';
import { RequirePermissions } from '../security/permissions.decorator';
import type { AuthenticatedRequest } from '../security/request-context';
import { financialWhere, jsonObject, recordWhere } from '../security/authorization';
import { FinanceController } from './finance.controller';

/** Customer plane is separate from staff routes and requires explicit module enablement. */
@Controller('portal')
export class PortalController {
  constructor(private readonly db: DatabaseService) {}

  private assertPortal(r: AuthenticatedRequest, product: 'sales' | 'projects' | 'finance') {
    if (
      r.auth.dataScope !== 'customer' ||
      !r.auth.customerId ||
      !r.auth.enabledModules.includes(product)
    )
      throw new ForbiddenException('Linked customer and enabled product required');
  }

  private async records(r: AuthenticatedRequest, module: 'quotations' | 'projects', id?: string) {
    this.assertPortal(r, module === 'quotations' ? 'sales' : module);
    const rows = await this.db.businessRecord.findMany({
      where: { AND: [recordWhere(r.auth, module), ...(id ? [{ id }] : [])] },
      select: { id: true, name: true, number: true, status: true, data: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const allowed =
      module === 'quotations'
        ? ['customerId', 'currency', 'subtotal', 'tax', 'total', 'validUntil']
        : ['customerId', 'serviceType', 'description', 'startDate', 'dueDate', 'progress'];
    const data = rows.map((row) => {
      const source = jsonObject(row.data);
      const visible = Object.fromEntries(
        Object.entries(source).filter(([key]) => allowed.includes(key)),
      );
      if (module === 'quotations' && Array.isArray(source.items))
        visible.items = source.items.map((item) =>
          Object.fromEntries(
            Object.entries(jsonObject(item)).filter(([key]) =>
              ['description', 'quantity', 'unitPrice', 'amount'].includes(key),
            ),
          ),
        );
      return { id: row.id, name: row.name, number: row.number, status: row.status, data: visible };
    });
    if (id && !data.length) throw new NotFoundException('Record not found');
    return id ? data[0] : { data };
  }

  @RequirePermissions('portal.quotations.view')
  @Get('quotations')
  quotations(@Req() r: AuthenticatedRequest) {
    return this.records(r, 'quotations');
  }
  @RequirePermissions('portal.quotations.view')
  @Get('quotations/:id')
  quotation(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return this.records(r, 'quotations', id);
  }
  @RequirePermissions('portal.projects.view')
  @Get('projects')
  projects(@Req() r: AuthenticatedRequest) {
    return this.records(r, 'projects');
  }
  @RequirePermissions('portal.projects.view')
  @Get('projects/:id')
  project(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    return this.records(r, 'projects', id);
  }

  @RequirePermissions('portal.invoices.view')
  @Get('invoices')
  invoices(@Req() r: AuthenticatedRequest) {
    this.assertPortal(r, 'finance');
    return this.db.invoice.findMany({
      where: financialWhere(r.auth),
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        currency: true,
        subtotal: true,
        tax: true,
        total: true,
        paid: true,
        status: true,
        dueAt: true,
      },
    });
  }
  @RequirePermissions('portal.invoices.view')
  @Get('invoices/:id')
  async invoice(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    this.assertPortal(r, 'finance');
    return new FinanceController(this.db).getInvoice(id, r);
  }
  @RequirePermissions('portal.invoices.view')
  @Get('receipts/:id')
  receipt(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthenticatedRequest) {
    this.assertPortal(r, 'finance');
    return new FinanceController(this.db).receipt(id, r);
  }
}
