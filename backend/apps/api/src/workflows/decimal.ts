import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@operix/database';
import { registerDecorator } from 'class-validator';

/** JSON strings preserve precision; existing numeric callers remain supported
 * only if their decimal spelling fits exactly. Never round a posting input. */
export function decimal(
  value: unknown,
  scale: number,
  positive = false,
  signed = false,
): Prisma.Decimal {
  const text =
    typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : typeof value === 'string'
        ? value
        : '';
  if (!new RegExp(`^-?\\d{1,${18 - scale}}(?:\\.\\d{1,${scale}})?$`).test(text))
    throw new BadRequestException(`Expected a decimal with at most ${scale} fractional digits`);
  const result = new Prisma.Decimal(text);
  if ((!signed && result.isNegative()) || (positive && result.isZero()))
    throw new BadRequestException('Amount must be positive');
  return result;
}
export function money(value: unknown, currency: string, positive = false) {
  if (!['USD', 'EUR', 'GNF'].includes(currency))
    throw new BadRequestException('Unsupported posting currency');
  if (typeof value === 'number' && Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)
    throw new BadRequestException('Send large amounts as decimal strings');
  const result = decimal(value, 2, positive);
  if (currency === 'GNF' && result.decimalPlaces() !== 0)
    throw new BadRequestException('GNF requires whole units');
  return result;
}
export function DecimalInput(scale: number, positive = false, signed = false): PropertyDecorator {
  return (object, propertyName) =>
    registerDecorator({
      name: 'decimalInput',
      target: object.constructor,
      propertyName: String(propertyName),
      validator: {
        validate(value) {
          try {
            decimal(value, scale, positive, signed);
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage: () => 'Invalid decimal amount or precision',
      },
    });
}
