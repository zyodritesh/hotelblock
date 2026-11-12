function nativeBridge(): { dial?: (n: string) => void; whatsapp?: (n: string) => void } | null {
  const bridge = (window as unknown as { HotelBlockNative?: { dial?: (n: string) => void; whatsapp?: (n: string) => void } }).HotelBlockNative;
  return bridge || null;
}

export function dialNumber(phone: string) {
  const raw = phone.replace(/[^\d+]/g, '');
  const bridge = nativeBridge();
  if (bridge?.dial) {
    bridge.dial(raw);
    return;
  }
  window.location.href = `tel:${raw || phone}`;
}

export function openWhatsApp(phone: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.startsWith('0') && digits.length === 11) digits = `91${digits.slice(1)}`;
  const bridge = nativeBridge();
  if (bridge?.whatsapp) {
    bridge.whatsapp(digits);
    return;
  }
  window.location.href = `https://wa.me/${digits}`;
}
