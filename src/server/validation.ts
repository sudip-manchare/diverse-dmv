import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
export const phoneSchema = z.string().transform((value, ctx) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = trimmed.startsWith("+")
    ? parsePhoneNumberFromString(trimmed)
    : undefined;
  if (!parsed?.isValid() || parsed.ext) {
    ctx.addIssue({
      code: "custom",
      message:
        "Enter a valid phone number with its country code, or leave this blank. Extensions are not supported.",
    });
    return z.NEVER;
  }
  return parsed.number;
});
export const operationSchema = z
  .object({ operationId: z.string().uuid() })
  .strict();
export const versionSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
