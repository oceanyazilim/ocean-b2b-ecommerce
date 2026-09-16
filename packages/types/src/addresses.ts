import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().optional();

// One postal-address document shared by customers, company locations and (later) orders.
// Stored as JSONB after validation; never queried by field, so shape changes stay cheap.
export const addressSchema = z.object({
  firstName: optionalText(80),
  lastName: optionalText(80),
  company: optionalText(120),
  address1: text(200).min(1, "Street address is required"),
  address2: optionalText(200),
  city: text(120).min(1, "City is required"),
  province: optionalText(120),
  provinceCode: optionalText(10),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a two-letter country code"),
  zip: optionalText(20),
  phone: optionalText(40),
});
export type Address = z.infer<typeof addressSchema>;

export function formatAddressLines(address: Address): string[] {
  const name = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const locality = [address.zip, address.city, address.province].filter(Boolean).join(" ");
  return [name, address.company, address.address1, address.address2, locality, address.countryCode]
    .filter((line): line is string => !!line && line.trim().length > 0)
    .map((line) => line.trim());
}
