import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** E.164: a `+`, a non-zero country digit, then 6–14 more digits. */
export const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export class CreateUserDto {
  @ApiProperty({ example: 'Ada Lovelace', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: '+380501234567', description: 'Phone number in E.164 format' })
  @IsString()
  @Matches(E164_PATTERN, {
    message: 'phoneNumber must be in E.164 format, e.g. +380501234567',
  })
  phoneNumber: string;
}
