export function calculateSubscriptionPrice(
  sixMonthPrice: number,
  periodMonths: 6 | 24,
  twentyFourMonthDiscount = 10,
) {
  if (sixMonthPrice < 0 || twentyFourMonthDiscount < 0 || twentyFourMonthDiscount > 100)
    throw new RangeError('Invalid subscription pricing');
  const basePrice = sixMonthPrice * (periodMonths / 6);
  const discountPercent = periodMonths === 24 ? twentyFourMonthDiscount : 0;
  const effectivePrice = Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
  return { basePrice, discountPercent, effectivePrice };
}
