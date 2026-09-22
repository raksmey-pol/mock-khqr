/**
 * Minimal type declarations for the official Bakong KHQR JavaScript SDK
 * (`bakong-khqr`, National Bank of Cambodia).
 *
 * The package ships no types, and the DefinitelyTyped definitions are
 * inaccurate: they model `IndividualInfo` / `MerchantInfo` as plain
 * interfaces, while at runtime they are classes that must be instantiated
 * with `new`.
 */
declare module "bakong-khqr" {
    export interface KhqrOptionalData {
        currency?: number;
        amount?: number;
        accountInformation?: string;
        acquiringBank?: string;
        billNumber?: string;
        mobileNumber?: string;
        storeLabel?: string;
        terminalLabel?: string;
        purposeOfTransaction?: string;
        languagePreference?: string;
        merchantNameAlternateLanguage?: string;
        merchantCityAlternateLanguage?: string;
        merchantCategoryCode?: string;
        expirationTimestamp?: number;
        upiMerchantAccount?: string;
    }

    export class IndividualInfo {
        constructor(
            bakongAccountID: string,
            merchantName: string,
            merchantCity?: string,
            optional?: KhqrOptionalData,
        );
    }

    export class MerchantInfo extends IndividualInfo {
        constructor(
            bakongAccountID: string,
            merchantName: string,
            merchantCity: string,
            merchantID: string,
            acquiringBank: string,
            optional?: KhqrOptionalData,
        );
    }

    export interface KhqrStatus {
        code: number;
        errorCode: number | null;
        message: string | null;
    }

    export interface KhqrGeneratedData {
        qr: string;
        md5: string;
    }

    export interface KhqrResponse {
        status: KhqrStatus;
        data: KhqrGeneratedData | null;
    }

    export const khqrData: {
        currency: { usd: number; khr: number };
        merchantType: { merchant: string; individual: string };
    };

    export class BakongKHQR {
        generateIndividual(individualInfo: IndividualInfo): KhqrResponse;
        generateMerchant(merchantInfo: MerchantInfo): KhqrResponse;
        static verify(qr: string): { isValid: boolean };
    }
}
