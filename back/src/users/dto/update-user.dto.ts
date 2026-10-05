import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsPhoneNumberE164 } from '../../common/transforms/phone-number.js';

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
  @IsPhoneNumberE164()
  phoneNumber?: string;
}
