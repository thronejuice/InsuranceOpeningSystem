import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/auth.decorators.js';
import { CustomerService } from './customer.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { CustomerQueryDto } from './dto/customer-query.dto.js';
import { CustomerResponse } from './dto/customer-response.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Get()
  @RequirePermissions('customer.view')
  @ApiOkResponse({ type: CustomerResponse, isArray: true })
  list(@Query() query: CustomerQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.list(query, user.permissions.includes('customer.view_sensitive'));
  }

  @Post()
  @RequirePermissions('customer.create')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.permissions.includes('customer.view_sensitive'));
  }

  @Get(':id')
  @RequirePermissions('customer.view')
  @ApiOkResponse({ type: CustomerResponse })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user.permissions.includes('customer.view_sensitive'));
  }

  @Put(':id')
  @RequirePermissions('customer.update')
  @ApiOkResponse({ type: CustomerResponse })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.permissions.includes('customer.view_sensitive'));
  }

  @Delete(':id')
  @RequirePermissions('customer.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
