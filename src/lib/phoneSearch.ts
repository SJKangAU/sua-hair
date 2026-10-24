// phoneSearch.ts
// Finding a booking or client by a mobile number however it is typed: "0412 345 678",
// "0412-345-678", "+61 412 345 678" and "412345" all mean the same digits as the stored
// "0412345678". Shared by the Bookings list, the Today search and the Clients search so
// they agree.

// The digits a search box text stands for, in the stored local form ("04..."), or "" when
// the text is not a phone number (it has letters, or fewer than `min` digits).
export const phoneQueryDigits = (raw: string, min = 3): string => {
  const text = raw.trim();
  if (!/^[\d\s+()-]+$/.test(text)) return "";
  let digits = text.replace(/\D/g, "");
  if (digits.length < min) return "";
  // "+61 4..." / "61 4..." (the way Fresha writes it) -> "04..."
  if (digits.startsWith("614")) digits = `0${digits.slice(2)}`;
  return digits;
};

// Does this stored number contain what was typed?
export const phoneMatches = (stored: string | undefined, raw: string): boolean => {
  const digits = phoneQueryDigits(raw);
  if (!digits || !stored) return false;
  return stored.replace(/\D/g, "").includes(digits);
};

// "0412345678" -> "0412 345 678"; anything else as it is
export const formatMobile = (phone: string): string => {
  const d = phone.replace(/\s/g, "");
  return /^04\d{8}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : phone;
};
