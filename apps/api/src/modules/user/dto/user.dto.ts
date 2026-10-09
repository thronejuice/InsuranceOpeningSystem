import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PERCENT_PATTERN = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

export class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(50) username!: string;
  @ApiProperty() @IsEmail() @MaxLength(200) email!: string;
  @ApiProperty() @IsString() @MaxLength(200) fullName!: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(100) password!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) roleIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string;
  @ApiPropertyOptional({ description: 'Share of gross commission in percent (0-100); null = system default' })
  @IsOptional() @Matches(PERCENT_PATTERN, { message: 'agentSharePct must be 0-100 with at most 2 decimals' }) agentSharePct?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) roleIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string | null;
  @ApiPropertyOptional({ description: 'Share of gross commission in percent (0-100); null = system default' })
  @IsOptional() @Matches(PERCENT_PATTERN, { message: 'agentSharePct must be 0-100 with at most 2 decimals' }) agentSharePct?: string | null;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(100) password!: string;
}
