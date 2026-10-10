import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { AddInsurerProductDto } from './dto/insurer.dto.js';
import { InsurerService } from './insurer.service.js';

@ApiTags('insurers')
@ApiBearerAuth()
@Controller('insurers')
export class InsurerController {
  constructor(private readonly service: InsurerService) {}

  @Get(':id/products')
  @RequirePermissions()
  listProducts(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listProducts(id);
  }

  @Post(':id/products')
  @RequirePermissions('master.manage')
  addProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddInsurerProductDto) {
    return this.service.addProduct(id, dto);
  }

  @Delete(':id/products/:productId')
  @RequirePermissions('master.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeProduct(@Param('id', ParseUUIDPipe) id: string, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.service.removeProduct(id, productId);
  }

  /** Business performance of one insurer — a broker-wide aggregate, so it needs report access. */
  @Get(':id/stats')
  @RequirePermissions('report.view')
  stats(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.stats(id);
  }
}
