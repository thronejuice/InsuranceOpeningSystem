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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { UserService } from './user.service.js';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Get('roles')
  @RequirePermissions('user.manage')
  listRoles() {
    return this.service.listRoles();
  }

  @Get()
  @RequirePermissions('user.manage')
  listUsers() {
    return this.service.listUsers();
  }

  @Get(':id')
  @RequirePermissions('user.manage')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getUser(id);
  }

  @Post()
  @RequirePermissions('user.manage')
  createUser(@Body() dto: CreateUserDto) {
    return this.service.createUser(dto);
  }

  @Put(':id')
  @RequirePermissions('user.manage')
  updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.service.updateUser(id, dto);
  }

  @Post(':id/reset-password')
  @RequirePermissions('user.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('user.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deactivateUser(id);
  }
}
