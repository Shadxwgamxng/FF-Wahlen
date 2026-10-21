import type { EinsatzMask } from './types';

export function emptyMask(phone = ''): EinsatzMask {
  return { callerName: '', callerPhone: phone, street: '', houseNumber: '', postcode: '', city: '', object: '', info: '', patientName: '', targetHospitalId: '', targetAddress: '', remarks: '', position: null };
}

export function maskAddress(m: Pick<EinsatzMask, 'street' | 'houseNumber' | 'postcode' | 'city'>): string {
  return `${m.street.trim()} ${m.houseNumber.trim()}`.trim() + (m.postcode || m.city ? `, ${`${m.postcode} ${m.city}`.trim()}` : '');
}
