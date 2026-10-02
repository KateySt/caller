import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../entities/user.entity.js';

/** The public projection of a User — internal columns never cross the HTTP boundary. */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name: string;

  @ApiProperty({ example: '+380501234567' })
  phoneNumber: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt,
    };
  }
}
