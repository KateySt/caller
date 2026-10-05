import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';

/** Parses an international number (`+` prefix required) and returns it in E.164, else the input unchanged. */
export function normalizePhoneNumber(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return parsePhoneNumberFromString(trimmed)?.number ?? trimmed;
}

@ValidatorConstraint({ name: 'isE164PhoneNumber', async: false })
class IsE164PhoneNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith('+') && isValidPhoneNumber(value);
  }

  defaultMessage(): string {
    return 'phoneNumber must be a valid international phone number, e.g. +380501234567';
  }
}

/** Normalizes to E.164 and rejects numbers libphonenumber-js considers invalid. */
export function IsPhoneNumberE164(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) => normalizePhoneNumber(value)),
    IsString(),
    Validate(IsE164PhoneNumberConstraint),
  );
}
