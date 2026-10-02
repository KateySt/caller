import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../common/postgres.util.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** AC-6 / AC-7: all users, oldest first; an empty table yields an empty array. */
  findAll(): Promise<User[]> {
    return this.usersRepository.find({ order: { createdAt: 'ASC' } });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const user = this.usersRepository.create({
      name: dto.name,
      phoneNumber: dto.phoneNumber,
    });

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      // AC-4 — including two concurrent creates racing on the same number: the unique
      // index is the source of truth, so there's no check-then-insert window to lose.
      if (isUniqueViolation(error)) {
        throw new ConflictException('A user with this phone number already exists');
      }

      throw error;
    }
  }

  /** AC-11: anything that doesn't identify an existing user is a 404, malformed ids included. */
  async findOne(id: string): Promise<User> {
    const user = UUID_PATTERN.test(id)
      ? await this.usersRepository.findOne({ where: { id } })
      : null;

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phoneNumber } });
  }

  /** AC-26..AC-31: partial update; at least one of name/phoneNumber must be present. */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    if (dto.name === undefined && dto.phoneNumber === undefined) {
      throw new BadRequestException('At least one of name or phoneNumber must be provided');
    }

    const user = await this.findOne(id);

    if (dto.name !== undefined) {
      user.name = dto.name;
    }
    if (dto.phoneNumber !== undefined) {
      user.phoneNumber = dto.phoneNumber;
    }

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      // AC-29 — same race-safety posture as AC-4's create-time conflict.
      if (isUniqueViolation(error)) {
        throw new ConflictException('A user with this phone number already exists');
      }

      throw error;
    }
  }

  /**
   * AC-17: opens the contact's 24h free-form window. Last write wins — repeated or
   * out-of-order webhook deliveries simply re-apply the update (AC-22).
   * Returns false when no user owns that number (AC-19).
   */
  async markInboundMessage(phoneNumber: string, receivedAt: Date): Promise<boolean> {
    const result = await this.usersRepository.update(
      { phoneNumber },
      { lastInboundMessageAt: receivedAt },
    );

    return (result.affected ?? 0) > 0;
  }

  /** AC-18: records the latest delivery status reported for this contact. */
  async markMessageStatus(phoneNumber: string, status: string): Promise<boolean> {
    const result = await this.usersRepository.update(
      { phoneNumber },
      { lastWhatsAppMessageStatus: status },
    );

    return (result.affected ?? 0) > 0;
  }
}
