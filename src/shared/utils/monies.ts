import { Currency } from "../types/currency";

export function numberToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function centsToNumber(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function integerToCurrency(cents: number, currency: string): string {
  const amount = Math.abs(centsToNumber(cents));
  const isNegative = cents < 0;

  const formattedAmount = currency === "JPY" ? Math.round(amount).toString() : amount.toFixed(2);

  switch (currency) {
    case "EUR":
      return `${isNegative ? "-" : ""}€${formattedAmount}`;
    case "GBP":
      return `${isNegative ? "-" : ""}£${formattedAmount}`;
    case "JPY":
      return `${isNegative ? "-" : ""}¥${formattedAmount}`;
    case "CAD":
      return `${isNegative ? "-" : ""}CA$${formattedAmount}`;
    case "USD":
    default:
      return `${isNegative ? "-" : ""}$${formattedAmount}`;
  }
}
