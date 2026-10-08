import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { NotificationType } from '../../../generated/prisma/enums.js';

export class UpdatePreferenceItemDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [UpdatePreferenceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePreferenceItemDto)
  preferences!: UpdatePreferenceItemDto[];
}

export interface NotificationPreferenceResponse {
  type: NotificationType;
  email: boolean;
  inApp: boolean;
}

