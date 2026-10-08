import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(50) username!: string;
  @ApiProperty() @IsEmail() @MaxLength(200) email!: string;
  @ApiProperty() @IsString() @MaxLength(200) fullName!: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(100) password!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) roleIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) roleIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string | null;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(100) password!: string;
}
