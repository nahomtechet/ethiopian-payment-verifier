export type PaymentProvider =
  | 'cbe' | 'dbe' | 'awash' | 'dashen' | 'wegagen' | 'hibret' | 'nib' | 'boa' | 'zemen' | 'lion'
  | 'cbo' | 'oromia' | 'berhan' | 'abay' | 'bunna' | 'addis' | 'enat' | 'global' | 'zamzam' | 'hijra'
  | 'goh' | 'amhara' | 'ahadu' | 'siinqee' | 'tsehay' | 'tsedey' | 'gadaa' | 'rammis' | 'siket'
  | 'sidama' | 'omo' | 'shabelle' | 'telebirr' | 'kacha' | 'mpesa' | 'yaya' | 'tolopay' | 'vitabirr' | 'ebirr';

export interface BankMetadata {
  code: PaymentProvider;
  name: string;
  logo: string;
  primaryColor: string;
  isMobileMoney?: boolean;
}

// 32 Banks
export const CBE: BankMetadata = { code: 'cbe', name: 'Commercial Bank of Ethiopia', logo: 'https://paymentverifier.com/logos/cbe.png', primaryColor: '#7b1fa2' };
export const DBE: BankMetadata = { code: 'dbe', name: 'Development Bank of Ethiopia', logo: 'https://paymentverifier.com/logos/dbe.png', primaryColor: '#0d47a1' };
export const Awash: BankMetadata = { code: 'awash', name: 'Awash International Bank', logo: 'https://paymentverifier.com/logos/awash.png', primaryColor: '#e53935' };
export const Dashen: BankMetadata = { code: 'dashen', name: 'Dashen Bank', logo: 'https://paymentverifier.com/logos/dashen.png', primaryColor: '#ffb300' };
export const Wegagen: BankMetadata = { code: 'wegagen', name: 'Wegagen Bank', logo: 'https://paymentverifier.com/logos/wegagen.png', primaryColor: '#ff6f00' };
export const Hibret: BankMetadata = { code: 'hibret', name: 'Hibret Bank', logo: 'https://paymentverifier.com/logos/hibret.png', primaryColor: '#e65100' };
export const Nib: BankMetadata = { code: 'nib', name: 'Nib International Bank', logo: 'https://paymentverifier.com/logos/nib.png', primaryColor: '#fbc02d' };
export const BOA: BankMetadata = { code: 'boa', name: 'Bank of Abyssinia', logo: 'https://paymentverifier.com/logos/boa.png', primaryColor: '#0d47a1' };
export const Zemen: BankMetadata = { code: 'zemen', name: 'Zemen Bank', logo: 'https://paymentverifier.com/logos/zemen.png', primaryColor: '#37474f' };
export const Lion: BankMetadata = { code: 'lion', name: 'Lion International Bank', logo: 'https://paymentverifier.com/logos/lion.png', primaryColor: '#fbc02d' };
export const CBO: BankMetadata = { code: 'cbo', name: 'Cooperative Bank of Oromia', logo: 'https://paymentverifier.com/logos/cbo.png', primaryColor: '#2e7d32' };
export const Oromia: BankMetadata = { code: 'oromia', name: 'Oromia Bank', logo: 'https://paymentverifier.com/logos/oromia.png', primaryColor: '#1565c0' };
export const Berhan: BankMetadata = { code: 'berhan', name: 'Berhan Bank', logo: 'https://paymentverifier.com/logos/berhan.png', primaryColor: '#ff8f00' };
export const Abay: BankMetadata = { code: 'abay', name: 'Abay Bank', logo: 'https://paymentverifier.com/logos/abay.png', primaryColor: '#1e88e5' };
export const Bunna: BankMetadata = { code: 'bunna', name: 'Bunna Bank', logo: 'https://paymentverifier.com/logos/bunna.png', primaryColor: '#4e342e' };
export const Addis: BankMetadata = { code: 'addis', name: 'Addis International Bank', logo: 'https://paymentverifier.com/logos/addis.png', primaryColor: '#1565c0' };
export const Enat: BankMetadata = { code: 'enat', name: 'Enat Bank', logo: 'https://paymentverifier.com/logos/enat.png', primaryColor: '#d81b60' };
export const Global: BankMetadata = { code: 'global', name: 'Global Bank Ethiopia', logo: 'https://paymentverifier.com/logos/global.png', primaryColor: '#00838f' };
export const ZamZam: BankMetadata = { code: 'zamzam', name: 'ZamZam Bank', logo: 'https://paymentverifier.com/logos/zamzam.png', primaryColor: '#2e7d32' };
export const Hijra: BankMetadata = { code: 'hijra', name: 'Hijra Bank', logo: 'https://paymentverifier.com/logos/hijra.png', primaryColor: '#1b5e20' };
export const Goh: BankMetadata = { code: 'goh', name: 'Goh Betoch Bank', logo: 'https://paymentverifier.com/logos/goh.png', primaryColor: '#558b2f' };
export const Amhara: BankMetadata = { code: 'amhara', name: 'Amhara Bank', logo: 'https://paymentverifier.com/logos/amhara.png', primaryColor: '#c2185b' };
export const Ahadu: BankMetadata = { code: 'ahadu', name: 'Ahadu Bank', logo: 'https://paymentverifier.com/logos/ahadu.png', primaryColor: '#d32f2f' };
export const Siinqee: BankMetadata = { code: 'siinqee', name: 'Siinqee Bank', logo: 'https://paymentverifier.com/logos/siinqee.png', primaryColor: '#e65100' };
export const Tsehay: BankMetadata = { code: 'tsehay', name: 'Tsehay Bank', logo: 'https://paymentverifier.com/logos/tsehay.png', primaryColor: '#f57c00' };
export const Tsedey: BankMetadata = { code: 'tsedey', name: 'Tsedey Bank', logo: 'https://paymentverifier.com/logos/tsedey.png', primaryColor: '#2e7d32' };
export const Gadaa: BankMetadata = { code: 'gadaa', name: 'Gadaa Bank', logo: 'https://paymentverifier.com/logos/gadaa.png', primaryColor: '#212121' };
export const Rammis: BankMetadata = { code: 'rammis', name: 'Rammis Bank', logo: 'https://paymentverifier.com/logos/rammis.png', primaryColor: '#1b5e20' };
export const Siket: BankMetadata = { code: 'siket', name: 'Siket Bank', logo: 'https://paymentverifier.com/logos/siket.png', primaryColor: '#0277bd' };
export const Sidama: BankMetadata = { code: 'sidama', name: 'Sidama Bank', logo: 'https://paymentverifier.com/logos/sidama.png', primaryColor: '#2e7d32' };
export const Omo: BankMetadata = { code: 'omo', name: 'Omo Bank', logo: 'https://paymentverifier.com/logos/omo.png', primaryColor: '#1565c0' };
export const Shabelle: BankMetadata = { code: 'shabelle', name: 'Shabelle Bank', logo: 'https://paymentverifier.com/logos/shabelle.png', primaryColor: '#0288d1' };

// 7 Mobile Money Wallets
export const Telebirr: BankMetadata = { code: 'telebirr', name: 'Telebirr', logo: 'https://paymentverifier.com/logos/telebirr.png', primaryColor: '#008080', isMobileMoney: true };
export const Kacha: BankMetadata = { code: 'kacha', name: 'Kacha Digital Financial Service', logo: 'https://paymentverifier.com/logos/kacha.png', primaryColor: '#ff6f00', isMobileMoney: true };
export const Mpesa: BankMetadata = { code: 'mpesa', name: 'M-PESA Safaricom', logo: 'https://paymentverifier.com/logos/mpesa.png', primaryColor: '#4caf50', isMobileMoney: true };
export const Yaya: BankMetadata = { code: 'yaya', name: 'Yaya Wallet', logo: 'https://paymentverifier.com/logos/yaya.png', primaryColor: '#0288d1', isMobileMoney: true };
export const Tolopay: BankMetadata = { code: 'tolopay', name: 'ToloPay', logo: 'https://paymentverifier.com/logos/tolopay.png', primaryColor: '#1565c0', isMobileMoney: true };
export const Vitabirr: BankMetadata = { code: 'vitabirr', name: 'Vitabirr', logo: 'https://paymentverifier.com/logos/vitabirr.png', primaryColor: '#0288d1', isMobileMoney: true };
export const Ebirr: BankMetadata = { code: 'ebirr', name: 'e-birr', logo: 'https://paymentverifier.com/logos/ebirr.png', primaryColor: '#ff6f00', isMobileMoney: true };

export const BANKS: Record<PaymentProvider, BankMetadata> = {
  cbe: CBE, dbe: DBE, awash: Awash, dashen: Dashen, wegagen: Wegagen, hibret: Hibret, nib: Nib, boa: BOA, zemen: Zemen, lion: Lion,
  cbo: CBO, oromia: Oromia, berhan: Berhan, abay: Abay, bunna: Bunna, addis: Addis, enat: Enat, global: Global, zamzam: ZamZam, hijra: Hijra,
  goh: Goh, amhara: Amhara, ahadu: Ahadu, siinqee: Siinqee, tsehay: Tsehay, tsedey: Tsedey, gadaa: Gadaa, rammis: Rammis, siket: Siket,
  sidama: Sidama, omo: Omo, shabelle: Shabelle,
  telebirr: Telebirr, kacha: Kacha, mpesa: Mpesa, yaya: Yaya, tolopay: Tolopay, vitabirr: Vitabirr, ebirr: Ebirr
};
