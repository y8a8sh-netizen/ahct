
import { SystemState } from '../types';

/**
 * Local Analysis Service
 * Replaces external AI to ensure the system is free and offline-capable.
 */
export const getAiAdvice = async (state: SystemState): Promise<string> => {
  const { students, exams, rooms, proctors, committees } = state;

  // Basic validation
  if (students.length === 0 && exams.length === 0) {
    return "لا توجد بيانات كافية للتحليل. يرجى رفع ملفات المتدربين والاختبارات للحصول على نصائح.";
  }

  let advice = "تقرير المحلل الذكي للنظام:\n\n";

  // 1. Calculate Statistics
  const totalStudents = students.length;
  const avgRoomCapacity = rooms.length > 0 
    ? Math.floor(rooms.reduce((sum, r) => sum + r.capacity, 0) / rooms.length) 
    : 30;

  // Estimate total committees needed
  let estimatedCommittees = 0;
  
  // Group exams by Date + Time to find peak load
  const timeSlots: Record<string, number> = {}; // Total rooms needed per slot
  const blackboardTimeSlots: Record<string, number> = {}; // Labs needed per slot for Blackboard

  const blackboardExams = exams.filter(e => e.type === 'Blackboard');
  const labs = rooms.filter(r => r.type === 'Lab');
  const halls = rooms.filter(r => r.type === 'Hall');

  exams.forEach(exam => {
    const enrolledStudents = students.filter(s => s.courseCodes.includes(exam.courseCode)).length;
    if (enrolledStudents > 0) {
      // Estimate committees needed for this exam
      // Note: This is an estimation using average capacity. Actual logic uses specific room capacities.
      const committeesForExam = Math.ceil(enrolledStudents / avgRoomCapacity);
      estimatedCommittees += committeesForExam;

      const key = `${exam.date} ${exam.time}`;
      
      // Update General Load
      timeSlots[key] = (timeSlots[key] || 0) + committeesForExam;

      // Update Blackboard Specific Load
      if (exam.type === 'Blackboard') {
        blackboardTimeSlots[key] = (blackboardTimeSlots[key] || 0) + committeesForExam;
      }
    }
  });

  // Find peak usage
  const peakSlot = Object.entries(timeSlots).sort((a, b) => b[1] - a[1])[0];
  const maxConcurrentCommittees = peakSlot ? peakSlot[1] : 0;

  const peakBlackboardSlot = Object.entries(blackboardTimeSlots).sort((a, b) => b[1] - a[1])[0];
  const maxConcurrentLabs = peakBlackboardSlot ? peakBlackboardSlot[1] : 0;

  // 2. Generate Advice Sections
  
  // A. Blackboard & Labs Specific Advice (Priority)
  advice += `💻 **اختبارات البلاك بورد والمعامل:**\n`;
  advice += `- **تنويه هام:** النظام مبرمج لتوزيع جميع الاختبارات المحددة كـ (Blackboard/معمل) حصرياً داخل المعامل.\n`;
  advice += `- لديك **${blackboardExams.length}** اختبار بلاك بورد و **${labs.length}** معمل متاح.\n`;
  
  if (labs.length < maxConcurrentLabs) {
    advice += `- ⚠️ **عجز في المعامل:** في وقت الذروة (${peakBlackboardSlot?.[0]})، تحتاج إلى **${maxConcurrentLabs}** معمل في وقت واحد، بينما المتوفر لديك **${labs.length}** فقط. \n  *الحل المقترح:* قم بتوزيع اختبارات البلاك بورد على فترات مختلفة أو أيام أخرى.\n`;
  } else {
    advice += `- ✅ **وضع المعامل ممتاز:** عدد المعامل (${labs.length}) كافٍ لتغطية أقصى احتياج متزامن (${maxConcurrentLabs}).\n`;
  }

  // B. Committees General Advice
  advice += `\n📌 **التقدير العام للجان:**\n`;
  advice += `- إجمالي اللجان المتوقعة لكامل الجدول: **${estimatedCommittees}** لجنة.\n`;
  advice += `- أقصى عدد لجان (ورقي + عملي) في وقت واحد: **${maxConcurrentCommittees}**.\n`;
  
  // C. Capacity Advice
  advice += `\n🏢 **السعة المكانية (القاعات والمعامل):**\n`;
  if (rooms.length >= maxConcurrentCommittees) {
    advice += `- السعة الكلية ممتازة. لديك **${rooms.length}** مكان (قاعة/معمل) للاختبار، والاحتياج الأقصى **${maxConcurrentCommittees}**.\n`;
  } else {
    advice += `- ⚠️ **تنبيه سعة:** قد تواجه عجزاً كلياً في الأماكن في يوم ${peakSlot?.[0]}، حيث تحتاج **${maxConcurrentCommittees}** مكان.\n`;
  }

  // D. Proctor Advice
  advice += `\n👥 **المراقبين:**\n`;
  // We need 2 proctors per committee
  const proctorsNeededPeak = maxConcurrentCommittees * 2;
  
  if (proctors.length < proctorsNeededPeak) {
    advice += `- ⚠️ **نقص حاد في المراقبين:**\n  في وقت الذروة تحتاج **${maxConcurrentCommittees}** لجنة × 2 مراقب = **${proctorsNeededPeak}** مراقب.\n  المتوفر حالياً: **${proctors.length}** مراقب فقط.\n`;
  } else {
    advice += `- عدد المراقبين (${proctors.length}) كافٍ لتغطية أوقات الذروة (يتطلب ${proctorsNeededPeak} مراقب).\n`;
  }

  return advice;
};
