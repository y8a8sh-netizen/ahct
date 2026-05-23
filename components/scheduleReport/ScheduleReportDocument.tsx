import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScheduleDay, ExamCourse, PeriodHeader } from './types';
import {
  type PrintFormat,
  type PrintFooterContent,
  DEFAULT_PRINT_FOOTER,
  loadPrintFooter,
  savePrintFooter,
} from './printFooter';

export type { PrintFormat };

const DEFAULT_PERIOD_HEADERS: PeriodHeader[] = [
  { id: 0, label: 'الفترة الأولى ( 08:00 - 09:00 ص )' },
  { id: 1, label: 'الفترة الثانية ( 09:45 - 10:45 ص )' },
  { id: 2, label: 'الفترة الثالثة ( 11:30 - 12:30 م )' },
];

const PAGE_PX: Record<PrintFormat, { w: number; h: number; margin: number }> = {
  A3: { w: 1122, h: 1587, margin: 28 },
  A4: { w: 794, h: 1123, margin: 22 },
};

const SHEET_WIDTH: Record<PrintFormat, number> = {
  A3: 980,
  A4: 700,
};

const HEADER_IMAGE_STORAGE_KEY = 'smart_builder_report_header_image';
const FOOTER_LAYOUT_STORAGE_KEY = 'smart_builder_footer_layout_v1';

type FooterBlockKey = 'instructions' | 'seal' | 'signatures';

interface FooterLayout {
  order: FooterBlockKey[];
  hidden: Record<FooterBlockKey, boolean>;
  showLegend: boolean;
}

const DEFAULT_FOOTER_LAYOUT: FooterLayout = {
  order: ['instructions', 'seal', 'signatures'],
  hidden: {
    instructions: false,
    seal: false,
    signatures: false,
  },
  showLegend: true,
};

function loadFooterLayout(): FooterLayout {
  try {
    const raw = localStorage.getItem(FOOTER_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_FOOTER_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<FooterLayout>;
    const order = Array.isArray(parsed.order) ? parsed.order.filter(Boolean) as FooterBlockKey[] : DEFAULT_FOOTER_LAYOUT.order;
    const fullOrder = (['instructions', 'seal', 'signatures'] as FooterBlockKey[]).filter((k) => order.includes(k)).concat(
      (['instructions', 'seal', 'signatures'] as FooterBlockKey[]).filter((k) => !order.includes(k)),
    );
    return {
      order: fullOrder,
      hidden: {
        instructions: parsed.hidden?.instructions ?? false,
        seal: parsed.hidden?.seal ?? false,
        signatures: parsed.hidden?.signatures ?? false,
      },
      showLegend: parsed.showLegend ?? true,
    };
  } catch {
    return DEFAULT_FOOTER_LAYOUT;
  }
}

function saveFooterLayout(layout: FooterLayout): void {
  try {
    localStorage.setItem(FOOTER_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // ignore storage failures
  }
}

function PrintHeaderImage({ src, format }: { src: string; format: PrintFormat }) {
  return (
    <div className="w-full flex justify-center border-b border-slate-200 pb-3 mb-2">
      <img
        src={src}
        alt="ترويسة"
        className={`w-full h-auto object-contain rounded-lg ${format === 'A3' ? 'max-h-[120px]' : 'max-h-[88px]'}`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

function ExamCourseBox({ exam }: { exam: ExamCourse }) {
  let borderClass = 'border-r-[5px]';
  let catText = 'عام مشترك';
  let cardStyle: React.CSSProperties = {
    backgroundColor: '#f8fafc',
    borderRightColor: '#94a3b8',
  };
  let badgeStyle: React.CSSProperties = {
    backgroundColor: '#f1f5f9',
    color: '#1e293b',
  };

  if (exam.category === 'computer') {
    catText = 'شبكات الحاسب';
    cardStyle = {
      backgroundColor: '#fff8e6',
      borderRightColor: '#f59e0b',
    };
    badgeStyle = {
      backgroundColor: '#fef3c7',
      color: '#92400e',
    };
  } else if (exam.category === 'hr') {
    catText = 'موارد بشرية';
    cardStyle = {
      backgroundColor: '#eff6ff',
      borderRightColor: '#2563eb',
    };
    badgeStyle = {
      backgroundColor: '#dbeafe',
      color: '#1e40af',
    };
  }

  return (
    <div
      className={`p-2 rounded border border-slate-200 ${borderClass} shadow-sm course-box mb-1.5 last:mb-0`}
      style={cardStyle}
    >
      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 mb-0.5">
        <span className="font-mono text-slate-900 font-black bg-white/90 px-1 rounded border border-slate-200">
          {exam.code}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold" style={badgeStyle}>
          {catText}
        </span>
      </div>
      <div className="font-extrabold text-[11px] text-slate-950 leading-snug">{exam.name}</div>
    </div>
  );
}

function EditableText({
  value,
  onChange,
  className = '',
  rows = 1,
  placeholder = '',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  rows?: number;
  placeholder?: string;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, rows]);

  return (
    <textarea
      ref={textRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={`editable-field w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-amber-50/40 hover:bg-amber-50/70 border border-dashed border-amber-300/80 focus:border-amber-500 focus:bg-white rounded px-1.5 py-0.5 print:bg-transparent print:border-0 print:rounded-none print:p-0 print:resize-none ${className}`}
    />
  );
}

function EditableReportFooter({
  footer,
  onChange,
  layout,
  onLayoutChange,
}: {
  footer: PrintFooterContent;
  onChange: (f: PrintFooterContent) => void;
  layout: FooterLayout;
  onLayoutChange: (layout: FooterLayout) => void;
}) {
  const set = (key: keyof PrintFooterContent, val: string) => onChange({ ...footer, [key]: val });
  const blockTitle: Record<FooterBlockKey, string> = {
    instructions: 'التعليمات',
    seal: 'الختم',
    signatures: 'التواقيع',
  };

  const moveBlock = (key: FooterBlockKey, dir: -1 | 1) => {
    const idx = layout.order.indexOf(key);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= layout.order.length) return;
    const next = [...layout.order];
    [next[idx], next[target]] = [next[target], next[idx]];
    onLayoutChange({ ...layout, order: next });
  };

  const toggleBlock = (key: FooterBlockKey) => {
    onLayoutChange({
      ...layout,
      hidden: {
        ...layout.hidden,
        [key]: !layout.hidden[key],
      },
    });
  };

  const visibleBlocks = layout.order.filter((key) => !layout.hidden[key]);

  const renderBlock = (key: FooterBlockKey) => {
    if (key === 'instructions') {
      return (
        <div className="w-full text-right space-y-1">
          <EditableText
            value={footer.instructionTitle}
            onChange={(v) => set('instructionTitle', v)}
            className="text-[9.5px] text-slate-700 footer-title-bold"
            rows={2}
          />
          <EditableText
            value={footer.instruction1}
            onChange={(v) => set('instruction1', v)}
            className="text-[9.5px] text-slate-700"
            rows={2}
          />
          <EditableText
            value={footer.instruction2}
            onChange={(v) => set('instruction2', v)}
            className="text-[9.5px] text-slate-700"
            rows={2}
          />
          <EditableText
            value={footer.instruction3}
            onChange={(v) => set('instruction3', v)}
            className="text-[9.5px] text-slate-700"
            rows={2}
          />
        </div>
      );
    }

    if (key === 'seal') {
      return (
        <div className="flex flex-col items-center text-center gap-1">
          <EditableText
            value={footer.centerTitle}
            onChange={(v) => set('centerTitle', v)}
            className="text-center font-black text-slate-900 text-[10px] signature-field"
            rows={2}
          />
          <EditableText
            value={footer.centerLine1}
            onChange={(v) => set('centerLine1', v)}
            className="text-center text-[8px] font-black leading-tight signature-field"
            rows={2}
          />
          <EditableText
            value={footer.centerLine2}
            onChange={(v) => set('centerLine2', v)}
            className="text-center text-[7px] font-bold text-slate-600 signature-field"
            rows={1}
          />
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="space-y-1">
          <EditableText
            value={footer.leftTitle}
            onChange={(v) => set('leftTitle', v)}
            className="text-center font-extrabold text-[10px] signature-field footer-title-bold"
            rows={1}
            placeholder="مسمى التوقيع"
          />
          <EditableText
            value={footer.leftNote}
            onChange={(v) => set('leftNote', v)}
            className="text-center text-[9px] text-slate-500 italic signature-field"
            rows={2}
            placeholder="ملاحظة الاعتماد"
          />
        </div>
        <div className="space-y-1">
          <EditableText
            value={footer.rightTitle}
            onChange={(v) => set('rightTitle', v)}
            className="text-center font-extrabold text-[10px] signature-field footer-title-bold"
            rows={1}
          />
          <EditableText
            value={footer.rightNote}
            onChange={(v) => set('rightNote', v)}
            className="text-center text-[9px] text-[#1a365d] font-bold signature-field"
            rows={2}
          />
        </div>
      </div>
    );
  };

  return (
    <footer className="report-footer mt-4 shrink-0">
      <p className="no-print text-[10px] text-amber-800 font-bold mb-2 text-center">
        ✏️ عدّل نصوص الاعتماد والذيل مباشرة في الحقول أدناه — ما تراه هو ما يُطبع
      </p>

      {layout.showLegend && (
        <div className="p-3 border border-slate-300 rounded-xl bg-slate-50 flex flex-wrap gap-3 text-[10px] font-bold text-slate-800 mb-3">
          <span className="flex items-center gap-1">
            <span
              className="w-3.5 h-3.5 rounded-sm legend-chip-computer"
              style={{ display: 'inline-block', width: '14px', height: '14px', backgroundColor: '#f59e0b', border: '1px solid #b45309' }}
            />{' '}
            شبكات
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-3.5 h-3.5 rounded-sm legend-chip-hr"
              style={{ display: 'inline-block', width: '14px', height: '14px', backgroundColor: '#2563eb', border: '1px solid #1d4ed8' }}
            />{' '}
            موارد
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-3.5 h-3.5 rounded-sm legend-chip-shared"
              style={{ display: 'inline-block', width: '14px', height: '14px', backgroundColor: '#94a3b8', border: '1px solid #475569' }}
            />{' '}
            مشترك
          </span>
        </div>
      )}

      <div className="no-print mb-2 p-2 rounded border border-amber-300 bg-amber-50 text-[10px] flex flex-wrap gap-2 items-center">
        {(['instructions', 'seal', 'signatures'] as FooterBlockKey[]).map((key) => (
          <div key={key} className="flex items-center gap-1 border border-amber-300 rounded px-2 py-1 bg-white">
            <span className="font-bold">{blockTitle[key]}</span>
            <button type="button" onClick={() => moveBlock(key, -1)} className="px-1 rounded bg-slate-200">←</button>
            <button type="button" onClick={() => moveBlock(key, 1)} className="px-1 rounded bg-slate-200">→</button>
            <button type="button" onClick={() => toggleBlock(key)} className="px-1 rounded bg-red-100 text-red-700">
              {layout.hidden[key] ? 'إظهار' : 'إخفاء'}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onLayoutChange({ ...layout, showLegend: !layout.showLegend })}
          className="px-2 py-1 rounded border border-slate-300 bg-white"
        >
          {layout.showLegend ? 'إخفاء مفتاح الألوان' : 'إظهار مفتاح الألوان'}
        </button>
      </div>

      <div className={`pt-3 border-t-2 border-slate-300 grid gap-4 text-[10px] font-shared ${visibleBlocks.length === 1 ? 'grid-cols-1' : visibleBlocks.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {visibleBlocks.map((key) => (
          <div key={key}>
            {renderBlock(key)}
          </div>
        ))}
      </div>
    </footer>
  );
}

export interface ScheduleReportDocumentProps {
  format: PrintFormat;
  scheduleData: ScheduleDay[];
  customHeaderImage: string | null;
  footer: PrintFooterContent;
  onReportTitleChange?: (value: string) => void;
  onReportSubtitleChange?: (value: string) => void;
  onFooterChange: (f: PrintFooterContent) => void;
  footerLayout: FooterLayout;
  onFooterLayoutChange: (layout: FooterLayout) => void;
  sheetRef?: React.RefObject<HTMLDivElement | null>;
  periodHeaders?: PeriodHeader[];
  reportTitle?: string;
  reportSubtitle?: string;
}

export function ScheduleReportDocument({
  format,
  scheduleData,
  customHeaderImage,
  footer,
  onReportTitleChange = () => {},
  onReportSubtitleChange = () => {},
  onFooterChange,
  footerLayout,
  onFooterLayoutChange,
  sheetRef: externalSheetRef,
  periodHeaders = DEFAULT_PERIOD_HEADERS,
  reportTitle = 'جدول الاختبارات النهائية الشامل والموحد — الكلية التقنية بأحد رفيدة',
  reportSubtitle = 'الفصل التدريبي الثاني ١٤٤٧ هـ / ٢٠٢٦ م',
}: ScheduleReportDocumentProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const sheetRef = externalSheetRef ?? internalRef;
  const isA3 = format === 'A3';
  const periodColWidth = `${Math.floor(86 / periodHeaders.length)}%`;

  return (
    <div
      id="schedule-report-document"
      ref={sheetRef}
      className="schedule-report-sheet bg-white rounded-xl shadow-lg print:shadow-none print:rounded-none print:border-0"
      style={{ padding: isA3 ? '20px 24px' : '14px 16px' }}
    >
      {customHeaderImage && <PrintHeaderImage src={customHeaderImage} format={format} />}

      <div className="text-center mb-3 pb-2 border-b-2 border-slate-300">
        <EditableText
          value={reportTitle}
          onChange={onReportTitleChange}
          className={`text-center font-black text-slate-950 leading-tight mb-0 report-header-center ${isA3 ? 'text-lg' : 'text-base'}`}
          rows={1}
        />
        <EditableText
          value={reportSubtitle}
          onChange={onReportSubtitleChange}
          className="text-center text-[11px] text-slate-600 mt-0 font-shared font-bold text-[#1a365d] report-header-center"
          rows={1}
        />
      </div>

      <div className="report-table-wrap">
        <table className="report-cell-grid w-full">
          <thead>
            <tr>
              <th className="w-[14%]">اليوم والتاريخ والتوقيت</th>
              {periodHeaders.map((ph) => (
                <th key={ph.id} style={{ width: periodColWidth }}>
                  {ph.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scheduleData.map((day, idx) => (
              <tr key={`${day.date}-${idx}`}>
                <td className="p-2.5 bg-slate-100 text-center font-bold font-shared align-top">
                  <div className="text-sm font-black text-slate-950">{day.dayName}</div>
                  <div className="text-[9px] text-slate-500 font-mono uppercase">{day.englishDay}</div>
                  <div className="text-[10px] text-[#1a365d] font-bold mt-1">{day.date} م</div>
                  <div className="text-[9px] text-amber-700 font-extrabold">{day.hijriDate}</div>
                </td>
                {periodHeaders.map((ph) => {
                  const exams = day.periods.find((p) => p.id === ph.id)?.exams ?? [];
                  return (
                    <td key={ph.id} className="p-2 align-top bg-white">
                      {exams.length > 0 ? (
                        exams.map((exam, i) => (
                          <ExamCourseBox key={`${exam.code}-${i}`} exam={exam} />
                        ))
                      ) : (
                        <div className="py-4 text-center text-slate-300 text-[9px] font-bold">—</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EditableReportFooter
        footer={footer}
        onChange={onFooterChange}
        layout={footerLayout}
        onLayoutChange={onFooterLayoutChange}
      />
    </div>
  );
}

export interface ReportEditorViewProps {
  scheduleData: ScheduleDay[];
  customHeaderImage: string | null;
  initialFormat?: PrintFormat;
  onClose?: () => void;
  standalone?: boolean;
  periodHeaders?: PeriodHeader[];
  reportTitle?: string;
  reportSubtitle?: string;
}

export function ReportEditorView({
  scheduleData,
  customHeaderImage,
  initialFormat = 'A3',
  onClose,
  standalone = false,
  periodHeaders,
  reportTitle,
  reportSubtitle,
}: ReportEditorViewProps) {
  const [format] = useState<PrintFormat>(initialFormat === 'A3' ? 'A3' : 'A3');
  const [footer, setFooter] = useState<PrintFooterContent>(loadPrintFooter);
  const [footerLayout, setFooterLayout] = useState<FooterLayout>(loadFooterLayout);
  const [scale, setScale] = useState(1);
  const [headerImageSrc, setHeaderImageSrc] = useState<string | null>(() => {
    if (customHeaderImage) return customHeaderImage;
    try {
      return localStorage.getItem(HEADER_IMAGE_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const sheetRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isA3 = format === 'A3';
  const [editableReportTitle, setEditableReportTitle] = useState(
    reportTitle || 'جدول الاختبارات النهائية الشامل والموحد — الكلية التقنية بأحد رفيدة',
  );
  const [editableReportSubtitle, setEditableReportSubtitle] = useState(
    reportSubtitle || 'الفصل التدريبي الثاني ١٤٤٧ هـ / ٢٠٢٦ م',
  );

  const persistFooter = useCallback((next: PrintFooterContent) => {
    setFooter(next);
    savePrintFooter(next);
  }, []);

  const persistFooterLayout = useCallback((next: FooterLayout) => {
    setFooterLayout(next);
    saveFooterLayout(next);
  }, []);

  const persistHeaderImage = useCallback((next: string | null) => {
    setHeaderImageSrc(next);
    try {
      if (next) {
        localStorage.setItem(HEADER_IMAGE_STORAGE_KEY, next);
      } else {
        localStorage.removeItem(HEADER_IMAGE_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, []);

  const handleHeaderImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (result) {
        persistHeaderImage(result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }, [persistHeaderImage]);

  useEffect(() => {
    if (customHeaderImage) {
      persistHeaderImage(customHeaderImage);
    }
  }, [customHeaderImage, persistHeaderImage]);

  useEffect(() => {
    setEditableReportTitle(reportTitle || 'جدول الاختبارات النهائية الشامل والموحد — الكلية التقنية بأحد رفيدة');
  }, [reportTitle]);

  useEffect(() => {
    setEditableReportSubtitle(reportSubtitle || 'الفصل التدريبي الثاني ١٤٤٧ هـ / ٢٠٢٦ م');
  }, [reportSubtitle]);

  const fitSheet = useCallback(() => {
    const sheet = sheetRef.current;
    const stage = stageRef.current;
    if (!sheet || !stage) return;

    const { w, h, margin } = PAGE_PX[format];
    const availW = w - margin * 2;
    const availH = h - margin * 2;

    sheet.style.transform = 'none';
    sheet.style.width = `${SHEET_WIDTH[format]}px`;
    void sheet.offsetHeight;

    const rawScale = availW / sheet.scrollWidth;
    const nextScale = rawScale * 0.985;
    setScale(nextScale);
    sheet.style.transformOrigin = 'top center';
    sheet.style.transform = `scale(${nextScale})`;
    sheet.style.marginLeft = 'auto';
    sheet.style.marginRight = 'auto';
    stage.style.width = `${availW}px`;
    stage.style.height = `${Math.ceil(sheet.scrollHeight * nextScale)}px`;
    stage.style.display = 'flex';
    stage.style.justifyContent = 'center';
    stage.style.paddingLeft = '10px';
    stage.style.paddingRight = '14px';
    stage.style.boxSizing = 'border-box';
    stage.style.overflow = 'visible';
  }, [format]);

  useEffect(() => {
    fitSheet();
    const t1 = setTimeout(fitSheet, 200);
    const t2 = setTimeout(fitSheet, 700);
    window.addEventListener('resize', fitSheet);
    window.addEventListener('beforeprint', fitSheet);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', fitSheet);
      window.removeEventListener('beforeprint', fitSheet);
    };
  }, [fitSheet, scheduleData, headerImageSrc, footer, format, periodHeaders]);

  const handlePrint = () => {
    fitSheet();
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.setProperty('--print-scale', `${scale}`);
    }
    document.body.classList.add('printing-schedule-report');
    window.print();
    window.addEventListener(
      'afterprint',
      () => {
        document.body.classList.remove('printing-schedule-report');
      },
      { once: true },
    );
  };

  const handleExportPdf = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet) {
      alert('تعذر العثور على محتوى التقرير للتصدير.');
      return;
    }

    // Collect all page CSS so fonts and colours render correctly in the new window.
    const allStyles = Array.from(document.styleSheets).map((ss) => {
      try {
        return Array.from(ss.cssRules).map((r) => r.cssText).join('\n');
      } catch {
        const link = ss.ownerNode as HTMLLinkElement | null;
        return link?.href ? `@import url('${link.href}');` : '';
      }
    }).join('\n');

    const exportNode = sheet.cloneNode(true) as HTMLElement;
    const sourceNodes = [sheet, ...Array.from(sheet.querySelectorAll<HTMLElement>('*'))];
    const cloneNodes = [exportNode, ...Array.from(exportNode.querySelectorAll<HTMLElement>('*'))];
    const colorProps = [
      'color',
      'font-family',
      'font-size',
      'line-height',
      'background-color',
      'background-image',
      'border-top-color',
      'border-right-color',
      'border-bottom-color',
      'border-left-color',
      'border-top-width',
      'border-right-width',
      'border-bottom-width',
      'border-left-width',
      'border-top-style',
      'border-right-style',
      'border-bottom-style',
      'border-left-style',
      'box-shadow',
      'text-shadow',
      'font-weight',
      'text-align',
      'direction',
      'opacity',
    ] as const;

    sourceNodes.forEach((src, idx) => {
      const dst = cloneNodes[idx];
      if (!dst) return;
      const cs = window.getComputedStyle(src);
      colorProps.forEach((prop) => {
        const val = cs.getPropertyValue(prop);
        if (val) {
          dst.style.setProperty(prop, val, 'important');
        }
      });
    });

    const sourceTextareas = Array.from(sheet.querySelectorAll('textarea'));
    const clonedTextareas = Array.from(exportNode.querySelectorAll('textarea'));
    sourceTextareas.forEach((src, idx) => {
      const dst = clonedTextareas[idx];
      if (!dst) return;
      dst.value = src.value;
      dst.textContent = src.value;
      dst.setAttribute('value', src.value);
    });

    // Replace textareas with static blocks so footer text keeps multiline formatting in PDF export.
    clonedTextareas.forEach((ta) => {
      const block = document.createElement('div');
      block.className = `${ta.className} export-textarea-value`;
      block.textContent = ta.value;
      block.style.whiteSpace = 'pre-wrap';
      block.style.overflowWrap = 'anywhere';
      block.style.wordBreak = 'break-word';
      block.style.lineHeight = '1.35';
      ta.replaceWith(block);
    });
    const sheetHtml = exportNode.outerHTML;

    const win = window.open('', '_blank', 'width=1200,height=900');
    if (!win) {
      alert('يرجى السماح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.');
      return;
    }

    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>جدول الاختبارات — A3</title>
  <style>
    ${allStyles}
    @page { size: A3 portrait; margin: 0; }
    html, body {
      margin: 0; padding: 0; background: #fff;
      width: 297mm; height: 420mm;
      overflow: hidden;
      direction: rtl;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      forced-color-adjust: none !important;
    }
    .pdf-page {
      width: 297mm;
      height: 420mm;
      box-sizing: border-box;
      padding: 3mm 8mm 8mm 8mm;
      overflow: hidden;
      margin: 0 auto;
      background: #fff;
      page-break-after: avoid;
      break-after: avoid;
    }
    .pdf-content {
      transform-origin: top center;
      margin: 0 auto;
      will-change: transform;
    }
    .schedule-report-sheet {
      width: 257mm !important;
      box-shadow: none !important;
      transform: none !important;
      border-radius: 0 !important;
      padding: 8px 20px 16px !important;
      margin: 0 auto !important;
    }
    .editable-field, .export-textarea-value {
      resize: none !important;
      overflow: visible !important;
      direction: rtl !important;
      unicode-bidi: plaintext !important;
      text-align: right !important;
      white-space: pre-wrap !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      min-height: 0 !important;
      height: auto !important;
    }
    .editable-field.report-header-center,
    .export-textarea-value.report-header-center {
      text-align: center !important;
    }
    .editable-field.signature-field,
    .export-textarea-value.signature-field {
      text-align: center !important;
    }
    .editable-field.footer-title-bold,
    .export-textarea-value.footer-title-bold {
      font-weight: 700 !important;
    }
    .report-cell-grid thead th,
    .report-cell-grid thead tr th,
    .report-cell-grid thead th * {
      background: #0f172a !important;
      background-color: #0f172a !important;
      color: #ffffff !important;
      -webkit-text-fill-color: #ffffff !important;
      font-weight: 800 !important;
      border-color: #1e293b !important;
    }
    .export-textarea-value {
      display: block !important;
      white-space: pre-wrap !important;
      word-break: break-word !important;
    }
    .no-print { display: none !important; }
    .course-box {
      break-inside: avoid;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      forced-color-adjust: none !important;
    }
    .legend-chip-computer { background: #f59e0b !important; border: 1px solid #b45309 !important; }
    .legend-chip-hr { background: #2563eb !important; border: 1px solid #1d4ed8 !important; }
    .legend-chip-shared { background: #94a3b8 !important; border: 1px solid #475569 !important; }
    .report-footer { break-inside: avoid; }
    @media print {
      html, body {
        width: 297mm !important;
        height: 420mm !important;
        overflow: hidden !important;
      }
      .pdf-page { margin: 0 !important; }
    }
  </style>
</head>
<body>
  <div class="pdf-page">
    <div class="pdf-content">${sheetHtml}</div>
  </div>
  <script>
    window.addEventListener('load', function() {
      var page = document.querySelector('.pdf-page');
      var content = document.querySelector('.pdf-content');
      if (page && content) {
        content.style.transform = 'none';
        var contentWidth = content.scrollWidth || 1;
        var contentHeight = content.scrollHeight || 1;
        var scaleX = page.clientWidth / contentWidth;
        var scaleY = page.clientHeight / contentHeight;
        var finalScale = Math.min(scaleX, scaleY, 1);
        content.style.width = contentWidth + 'px';
        content.style.transform = 'scale(' + finalScale + ')';
      }
      setTimeout(function() { window.print(); }, 500);
    });
  <\/script>
</body>
</html>`);
    win.document.close();
  }, []);

  return (
    <div
      className="report-editor-root fixed inset-0 z-[200] min-h-screen bg-slate-200/90 font-sans text-slate-900 overflow-auto"
      dir="rtl"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @page { size: A3 portrait; margin: 8mm; }
          .report-table-wrap {
            border: 2px solid #1e293b;
            border-radius: 6px;
            overflow: hidden;
            box-sizing: border-box;
          }
          .report-cell-grid { border-collapse: collapse; table-layout: fixed; width: 100%; }
          .report-cell-grid th, .report-cell-grid td { border: 1.5px solid #1e293b; vertical-align: top; }
          .report-cell-grid tr > *:first-child { border-right-width: 2px; }
          .report-cell-grid tr > *:last-child { border-left-width: 2px; }
          .report-cell-grid thead tr:first-child th { border-top-width: 2px; }
          .report-cell-grid tbody tr:last-child td { border-bottom-width: 2px; }
          .report-cell-grid thead th {
            background: #0f172a; color: #fff; font-weight: 800; text-align: center;
            padding: 6px 4px; font-size: 9.5px; line-height: 1.2;
          }
          .course-box { break-inside: avoid; page-break-inside: avoid; }
          .report-footer { break-inside: avoid; page-break-inside: avoid; }
          .report-footer, .report-footer * {
            font-family: 'Sakkal Majalla', 'Traditional Arabic', serif !important;
            color: #000 !important;
            font-weight: 400 !important;
          }
          @media print {
            html, body {
              margin: 0 !important; padding: 0 !important; background: #fff !important;
              -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; forced-color-adjust: none !important;
            }
            body.printing-schedule-report * { visibility: hidden !important; }
            body.printing-schedule-report .report-editor-root,
            body.printing-schedule-report .report-editor-root * {
              visibility: visible !important;
            }
            body.printing-schedule-report .report-fit-stage {
              position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important;
              margin: 0 auto !important; overflow: visible !important;
              display: flex !important; justify-content: center !important;
              padding-left: 12px !important; padding-right: 16px !important;
              box-sizing: border-box !important;
            }
            body.printing-schedule-report .schedule-report-sheet {
              box-shadow: none !important;
              transform-origin: top center !important;
              margin-left: auto !important; margin-right: auto !important;
            }
            body.printing-schedule-report .report-table-wrap {
              border: 2px solid #1e293b !important;
              -webkit-print-color-adjust: exact !important;
            }
            body.printing-schedule-report .editable-field {
              border: none !important; background: transparent !important;
            }
            body.printing-schedule-report .no-print { display: none !important; }
          }
          @media print {
            body.printing-schedule-report .schedule-report-sheet {
              transform: scale(var(--print-scale, ${Math.max(0.4, Math.min(1.2, scale))})) !important;
              transform-origin: top center !important;
            }
          }
        `,
        }}
      />

      <div className="no-print sticky top-0 z-50 flex flex-wrap items-center justify-center gap-2 bg-slate-900 text-white px-4 py-2.5 text-xs shadow-lg">
        <span className="font-bold">تقرير الجدول — معاينة = طباعة (A3)</span>
        <span className="text-slate-300">|</span>
        <span className="px-2 py-1 rounded font-bold bg-blue-600">تعبئة الصفحة</span>
        <span className="text-slate-300">|</span>
        <span>الفعلي: {Math.round(scale * 100)}%</span>
        <label className="px-3 py-1.5 rounded-lg font-bold bg-indigo-600 cursor-pointer">
          إضافة صورة للرأس
          <input type="file" accept="image/*" className="hidden" onChange={handleHeaderImageUpload} />
        </label>
        <button
          type="button"
          onClick={() => persistHeaderImage(null)}
          className="px-3 py-1.5 rounded-lg font-bold bg-slate-700"
        >
          حذف صورة الرأس
        </button>
        <button
          type="button"
          onClick={() => {
            persistFooter(DEFAULT_PRINT_FOOTER);
            persistFooterLayout(DEFAULT_FOOTER_LAYOUT);
          }}
          className="px-2 py-1.5 bg-amber-500 text-slate-900 rounded-lg font-bold"
        >
          استعادة الذيل
        </button>
        <button type="button" onClick={handleExportPdf} className="px-3 py-1.5 bg-red-600 rounded-lg font-bold">
          تصدير / حفظ PDF 📄
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="px-3 py-1.5 bg-slate-600 rounded-lg">
            {standalone ? 'العودة للتطبيق' : 'إغلاق المعاينة'}
          </button>
        )}
      </div>

      <div className="report-print-host flex justify-center p-4 print:p-0">
        <div ref={stageRef} className="report-fit-stage mx-auto">
          <ScheduleReportDocument
            format={format}
            scheduleData={scheduleData}
            customHeaderImage={headerImageSrc}
            footer={footer}
            reportTitle={editableReportTitle}
            reportSubtitle={editableReportSubtitle}
            onReportTitleChange={setEditableReportTitle}
            onReportSubtitleChange={setEditableReportSubtitle}
            onFooterChange={persistFooter}
            footerLayout={footerLayout}
            onFooterLayoutChange={persistFooterLayout}
            sheetRef={sheetRef}
            periodHeaders={periodHeaders}
          />
        </div>
      </div>
    </div>
  );
}
