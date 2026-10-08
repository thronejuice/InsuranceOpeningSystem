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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { MasterService } from './master.service.js';
import {
  CreateApprovalRuleDto,
  CreateDocumentChecklistDto,
  CreateInsuranceCompanyDto,
  CreateInsuranceCoverageDto,
  CreateInsuranceProductDto,
  CreateInsuranceTypeDto,
  CreateRiskFieldDto,
  UpdateApprovalRuleDto,
  UpdateDocumentChecklistDto,
  UpdateInsuranceCompanyDto,
  UpdateInsuranceCoverageDto,
  UpdateInsuranceProductDto,
  UpdateInsuranceTypeDto,
  UpdateRiskFieldDto,
} from './dto/master.dto.js';

@ApiTags('master')
@ApiBearerAuth()
@Controller('master')
export class MasterController {
  constructor(private readonly service: MasterService) {}

  // ─── Insurance Type ──────────────────────────────────────────────────────

  @Get('insurance-types')
  @RequirePermissions()
  listInsuranceTypes() {
    return this.service.listInsuranceTypes();
  }

  @Get('insurance-types/:id')
  @RequirePermissions()
  getInsuranceType(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getInsuranceType(id);
  }

  @Post('insurance-types')
  @RequirePermissions('master.manage')
  createInsuranceType(@Body() dto: CreateInsuranceTypeDto) {
    return this.service.createInsuranceType(dto);
  }

  @Put('insurance-types/:id')
  @RequirePermissions('master.manage')
  updateInsuranceType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInsuranceTypeDto) {
    return this.service.updateInsuranceType(id, dto);
  }

  // ─── Insurance Product ───────────────────────────────────────────────────

  @Get('products')
  @RequirePermissions()
  listProducts() {
    return this.service.listProducts();
  }

  @Get('products/:id')
  @RequirePermissions()
  getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getProduct(id);
  }

  @Get('products/:id/risk-fields')
  @RequirePermissions()
  getRiskFieldsForProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listRiskFields(id);
  }

  @Post('products')
  @RequirePermissions('master.manage')
  createProduct(@Body() dto: CreateInsuranceProductDto) {
    return this.service.createProduct(dto);
  }

  @Put('products/:id')
  @RequirePermissions('master.manage')
  updateProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInsuranceProductDto) {
    return this.service.updateProduct(id, dto);
  }

  // ─── Insurance Company ───────────────────────────────────────────────────

  @Get('companies')
  @RequirePermissions()
  listCompanies() {
    return this.service.listCompanies();
  }

  @Get('companies/:id')
  @RequirePermissions()
  getCompany(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCompany(id);
  }

  @Post('companies')
  @RequirePermissions('master.manage')
  createCompany(@Body() dto: CreateInsuranceCompanyDto) {
    return this.service.createCompany(dto);
  }

  @Put('companies/:id')
  @RequirePermissions('master.manage')
  updateCompany(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInsuranceCompanyDto) {
    return this.service.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  @RequirePermissions('master.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCompany(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCompany(id);
  }

  // ─── Insurance Coverage ──────────────────────────────────────────────────

  @Get('coverages')
  @RequirePermissions()
  @ApiQuery({ name: 'productId', required: true })
  listCoverages(@Query('productId', ParseUUIDPipe) productId: string) {
    return this.service.listCoverages(productId);
  }

  @Get('coverages/:id')
  @RequirePermissions()
  getCoverage(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCoverage(id);
  }

  @Post('coverages')
  @RequirePermissions('master.manage')
  createCoverage(@Body() dto: CreateInsuranceCoverageDto) {
    return this.service.createCoverage(dto);
  }

  @Put('coverages/:id')
  @RequirePermissions('master.manage')
  updateCoverage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInsuranceCoverageDto) {
    return this.service.updateCoverage(id, dto);
  }

  // ─── Risk Field Definition ───────────────────────────────────────────────

  @Get('risk-fields')
  @RequirePermissions()
  @ApiQuery({ name: 'productId', required: true })
  listRiskFields(@Query('productId', ParseUUIDPipe) productId: string) {
    return this.service.listRiskFields(productId);
  }

  @Get('risk-fields/:id')
  @RequirePermissions()
  getRiskField(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getRiskField(id);
  }

  @Post('risk-fields')
  @RequirePermissions('master.manage')
  createRiskField(@Body() dto: CreateRiskFieldDto) {
    return this.service.createRiskField(dto);
  }

  @Put('risk-fields/:id')
  @RequirePermissions('master.manage')
  updateRiskField(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRiskFieldDto) {
    return this.service.updateRiskField(id, dto);
  }

  // ─── Document Checklist ──────────────────────────────────────────────────

  @Get('document-checklists')
  @RequirePermissions()
  @ApiQuery({ name: 'productId', required: true })
  listDocumentChecklists(@Query('productId', ParseUUIDPipe) productId: string) {
    return this.service.listDocumentChecklists(productId);
  }

  @Get('document-checklists/:id')
  @RequirePermissions()
  getDocumentChecklist(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDocumentChecklist(id);
  }

  @Post('document-checklists')
  @RequirePermissions('master.manage')
  createDocumentChecklist(@Body() dto: CreateDocumentChecklistDto) {
    return this.service.createDocumentChecklist(dto);
  }

  @Put('document-checklists/:id')
  @RequirePermissions('master.manage')
  updateDocumentChecklist(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocumentChecklistDto) {
    return this.service.updateDocumentChecklist(id, dto);
  }

  // ─── Approval Rules ──────────────────────────────────────────────────────

  @Get('approval-rules')
  @RequirePermissions()
  listApprovalRules() {
    return this.service.listApprovalRules();
  }

  @Get('approval-rules/:id')
  @RequirePermissions()
  getApprovalRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getApprovalRule(id);
  }

  @Post('approval-rules')
  @RequirePermissions('master.manage')
  createApprovalRule(@Body() dto: CreateApprovalRuleDto) {
    return this.service.createApprovalRule(dto);
  }

  @Put('approval-rules/:id')
  @RequirePermissions('master.manage')
  updateApprovalRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateApprovalRuleDto) {
    return this.service.updateApprovalRule(id, dto);
  }
}
