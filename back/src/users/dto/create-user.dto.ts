import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsPhoneNumberE164 } from '../../common/transforms/phone-number.js';

export class CreateUserDto {
  @ApiProperty({ example: 'Ada Lovelace', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: '+380501234567', description: 'Phone number in E.164 format' })
  @IsPhoneNumberE164()
  phoneNumber: string;
}
