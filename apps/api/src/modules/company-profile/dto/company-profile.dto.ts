import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BankAccountDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) bankName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) branch?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) accountName!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(50) accountNo!: string;
}

export class UpdateCompanyProfileDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) nameTh!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) addressTh?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) addressEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) taxId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) brokerLicenseNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) website?: string;
  @ApiPropertyOptional({ description: 'Standard terms printed on the proposal, one per line' })
  @IsOptional() @IsString() @MaxLength(5000) proposalTerms?: string;

  @ApiProperty({ type: [BankAccountDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BankAccountDto)
  bankAccounts!: BankAccountDto[];
}

export interface BankAccount {
  bankName: string;
  branch?: string;
  accountName: string;
  accountNo: string;
}

export class CompanyProfileResponse {
  @ApiProperty() nameTh!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) addressTh!: string | null;
  @ApiProperty({ nullable: true, type: String }) addressEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) taxId!: string | null;
  @ApiProperty({ nullable: true, type: String }) brokerLicenseNo!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ nullable: true, type: String }) website!: string | null;
  @ApiProperty({ nullable: true, type: String }) proposalTerms!: string | null;
  @ApiProperty({ type: [BankAccountDto] }) bankAccounts!: BankAccount[];
  @ApiProperty() hasLogo!: boolean;
  @ApiProperty({ description: 'false until an admin saves the profile for the first time' }) configured!: boolean;
  @ApiProperty({ nullable: true, type: String }) updatedAt!: string | null;
}
