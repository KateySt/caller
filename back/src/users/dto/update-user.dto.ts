import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { E164_PATTERN } from './create-user.dto.js';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Ada Lovelace', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: '+380501234567', description: 'Phone number in E.164 format' })
  @IsOptional()
  @IsString()
  @Matches(E164_PATTERN, {
    message: 'phoneNumber must be in E.164 format, e.g. +380501234567',
  })
  phoneNumber?: string;
}
