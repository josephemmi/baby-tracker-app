// JOS-9: mL amount fields are whole-number-only (this household build has
// no decimal/oz support). The on-screen numeric keypad (inputMode=
// "numeric") already can't produce a decimal point, but a physical
// keyboard or paste still can — strip anything but digits so those paths
// can't slip a non-integer value into the commit.
export function sanitizeDigits(value: string): string {
  return value.replace(/\D+/g, "");
}
