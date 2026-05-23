export type PrintFormat = 'A3' | 'A4';

export interface PrintFooterContent {
  instructionTitle: string;
  instruction1: string;
  instruction2: string;
  instruction3: string;
  leftTitle: string;
  leftNote: string;
  centerTitle: string;
  centerLine1: string;
  centerLine2: string;
  rightTitle: string;
  rightNote: string;
}

export const DEFAULT_PRINT_FOOTER: PrintFooterContent = {
  instructionTitle: 'تعليمات وضوابط اللجان:',
  instruction1: 'على جميع المتدربين الالتزام بالحضور بالزي الوطني قبل موعد الاختبار.',
  instruction2: 'يمنع منعاً باتاً إدخال الهواتف أو المذكرات داخل لجان الاختبار.',
  instruction3: 'إبراز بطاقة المتدرب الرسمية شرط أساسي لدخول قاعات الاختبار.',
  leftTitle: 'مدير شؤون المتدربين',
  leftNote: 'توقيع معتمد إلكترونياً',
  centerTitle: 'الختم الرسمي ولجنة اللجان الأكاديمية',
  centerLine1: 'الكلية التقنية بأحد رفيدة',
  centerLine2: 'اعتماد رقم ٢٤',
  rightTitle: 'عميد الكلية التقنية',
  rightNote: 'مساعد ومقرر أكاديمي — بأحد رفيدة',
};

const STORAGE_KEY = 'smart_builder_print_footer';

export function loadPrintFooter(): PrintFooterContent {
  if (typeof window === 'undefined') return DEFAULT_PRINT_FOOTER;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PRINT_FOOTER, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PRINT_FOOTER;
}

export function savePrintFooter(data: PrintFooterContent) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
