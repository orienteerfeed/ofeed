export interface ValidationHelpers {
  t: (key: string) => string;
}

export const createValidations = ({ t }: ValidationHelpers) => ({
  // Základní validace
  required: (value: any) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return t('Validations.Required');
    }
    return undefined;
  },

  email: (value: string) => {
    if (!value) return undefined;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return t('Validations.Email');
    }
    return undefined;
  },

  requiredEmail: (value: string) => {
    const requiredError = createValidations({ t }).required(value);
    if (requiredError) return requiredError;
    return createValidations({ t }).email(value);
  },

  url: (value: string) => {
    if (!value) return undefined;
    try {
      new URL(value);
      return undefined;
    } catch {
      return t('Validations.Url');
    }
  },

  number: (value: any) => {
    if (!value) return undefined;
    if (isNaN(Number(value))) {
      return t('Validations.Number');
    }
    return undefined;
  },

  requiredNumber: (value: any) => {
    const requiredError = createValidations({ t }).required(value);
    if (requiredError) return requiredError;
    return createValidations({ t }).number(value);
  },

  minLength: (min: number) => (value: string) => {
    if (!value) return undefined;
    if (value.length < min) {
      // Pro parametry musíme mít speciální klíče v překladech
      return min === 1
        ? t('Validations.MinLength1')
        : t('Validations.MinLength');
    }
    return undefined;
  },

  maxLength: (max: number) => (value: string) => {
    if (!value) return undefined;
    if (value.length > max) {
      return t('Validations.MaxLength');
    }
    return undefined;
  },

  min: (min: number) => (value: number) => {
    if (value == null) return undefined;
    if (value < min) {
      return t('Validations.Min');
    }
    return undefined;
  },

  max: (max: number) => (value: number) => {
    if (value == null) return undefined;
    if (value > max) {
      return t('Validations.Max');
    }
    return undefined;
  },

  // Speciální validace
  time: (value: string) => {
    if (!value) return undefined;
    const timeRegex = /^\d{1,2}:\d{1,2}(:\d{1,2})?$/;
    if (!timeRegex.test(value)) {
      return t('Validations.Time');
    }
    return undefined;
  },

  requiredTime: (value: string) => {
    const requiredError = createValidations({ t }).required(value);
    if (requiredError) return requiredError;
    return createValidations({ t }).time(value);
  },

  csosRegNum: (value: string) => {
    if (!value) return undefined;
    const regNumRegex = /^[A-Z]{3}\d{4}$/;
    if (!regNumRegex.test(value)) {
      return t('Validations.RegNum');
    }
    return undefined;
  },

  requiredCsosRegNum: (value: string) => {
    const requiredError = createValidations({ t }).required(value);
    if (requiredError) return requiredError;
    return createValidations({ t }).csosRegNum(value);
  },

  gpsLatitude: (value: number) => {
    if (value == null) return undefined;
    if (value < -90 || value > 90) {
      return t('Validations.Latitude');
    }
    return undefined;
  },

  gpsLongitude: (value: number) => {
    if (value == null) return undefined;
    if (value < -180 || value > 180) {
      return t('Validations.Longitude');
    }
    return undefined;
  },

  // Pole emailů
  emails: (value: string) => {
    if (!value) return undefined;

    const emails = value.split(/[,;\s]+/).filter(email => email.trim());
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const invalidEmails = emails.filter(
      email => !emailRegex.test(email.trim())
    );
    if (invalidEmails.length > 0) {
      return t('Validations.EmailsContainNotEmail');
    }

    const uniqueEmails = new Set(emails);
    if (emails.length !== uniqueEmails.size) {
      return t('Validations.EmailsUnique');
    }

    return undefined;
  },

  uniqueMinMaxEmails: (min: number, max: number) => (value: string) => {
    const emailsError = createValidations({ t }).emails(value);
    if (emailsError) return emailsError;

    const emails = value.split(/[,;\s]+/).filter(email => email.trim());
    if (emails.length < min || emails.length > max) {
      // Pro různé kombinace min/max potřebujeme speciální klíče
      if (min === 1 && max === 1) {
        return t('Validations.EmailsExactlyOne');
      } else if (min === 1) {
        return t('Validations.EmailsMinOne');
      } else {
        return t('Validations.EmailsMinMax');
      }
    }

    return undefined;
  },

  // Soubory
  fileRequired: (value: File | null) => {
    if (!value) {
      return t('Validations.FileRequired');
    }
    return undefined;
  },

  fileRequiredPdf: (value: File | null) => {
    const fileError = createValidations({ t }).fileRequired(value);
    if (fileError) return fileError;

    if (value && value.type !== 'application/pdf') {
      return t('Validations.PdfOnly');
    }
    return undefined;
  },

  // Pole čísel
  requiredArrayOfNumbers: (value: number[]) => {
    const requiredError = createValidations({ t }).required(value);
    if (requiredError) return requiredError;

    if (!Array.isArray(value)) {
      return t('Validations.Array');
    }

    const invalidNumbers = value.filter(item => isNaN(Number(item)));
    if (invalidNumbers.length > 0) {
      return t('Validations.ArrayOfNumbers');
    }

    return undefined;
  },
});
