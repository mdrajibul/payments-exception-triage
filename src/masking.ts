const VISIBLE_DIGITS = 3;

export function maskBsb(bsb: string): string {
  return `***-${bsb.slice(-VISIBLE_DIGITS)}`;
}

export function maskAccountNumber(accountNumber: string): string {
  const hiddenCount = accountNumber.length - VISIBLE_DIGITS;
  return "*".repeat(hiddenCount) + accountNumber.slice(-VISIBLE_DIGITS);
}
