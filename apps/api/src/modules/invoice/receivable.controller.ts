import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { ReceivableService } from './receivable.service.js';
import { ListReceivableDto } from './dto/list-receivable.dto.js';

@ApiTags('receivables')
@ApiBearerAuth()
@Controller('receivables')
export class ReceivableController {
  constructor(private readonly service: ReceivableService) {}

  @Get()
  @RequirePermissions('receivable.view')
  list(@Query() query: ListReceivableDto) {
    return this.service.list(query);
  }
}
