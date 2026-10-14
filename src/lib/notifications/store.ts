/**
 * ASTROLABE — Notifications store (in-memory, prototype only)
 * ------------------------------------------------------------
 * PRD §07 — fewest notifications that keep a journey moving.
 * Bundled into one daily digest unless genuinely urgent.
 * Quiet hours respected in the employee's timezone.
 * One kill switch stops all outbound notifications instantly.
 *
 * This module is the single source of truth shared between the
 * GET /api/v1/notifications route and the POST /api/v1/notifications/action
 * route. State is in-memory and resets on server restart — by design
 * for the synthetic prototype.
 */
import { NOW } from "@/lib/data/pack";

export type NotificationType =
  "step_due" | "step_late" | "request_update" | "escalation" | "pulse_prompt" | "digest" | "system";

export type NotificationPriority = "urgent" | "normal" | "low";

export type NotificationCategory = "journey" | "request" | "hrbp" | "pulse" | "system";

export type NotificationView = "today" | "journey" | "ask" | "requests" | "me";

export interface NotificationAction {
  label: string;
  labelAr: string;
  view: NotificationView;
  stepKey?: string;
}

export interface Notification {
  id: string;
  employeeId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  action?: NotificationAction;
  createdAt: string; // ISO UTC
  readAt?: string; // ISO UTC
  snoozedUntil?: string; // ISO UTC
  archivedAt?: string; // ISO UTC
  category: NotificationCategory;
}

export interface QuietHours {
  start: "22:00";
  end: "07:00";
  tz: "Asia/Dubai";
}

export interface DigestConfig {
  enabled: true;
  scheduledAt: "08:00";
}

export interface NotificationsEnvelope {
  items: Notification[];
  quietHours: QuietHours;
  killSwitch: boolean;
  digest: DigestConfig;
}

/* ---------- helpers ---------- */

function iso(offsetHoursFromNow: number): string {
  return new Date(NOW.getTime() + offsetHoursFromNow * 3600 * 1000).toISOString();
}

/* ---------- base synthetic notifications for E-1042 (Maria Santos) ----------
 * Maria is on day 5 of onboarding. Her laptop (IT-KIT) is 3 days late.
 * Induction completed yesterday. Buddy assignment pending HR. Training
 * blocked on access provisioning. Pulse check available. Fatima (HRBP)
 * just claimed her case.
 *
 * Plain-language copy per PRD §28 — "Your laptop is 3 days late" not
 * "SLA breach on IT-KIT-02".
 */
const BASE_NOTIFICATIONS: Notification[] = [
  {
    id: "N-1042-01",
    employeeId: "E-1042",
    type: "step_late",
    priority: "urgent",
    title: "Your laptop is 3 days late",
    titleAr: "حاسوبك المحمول متأخر 3 أيام",
    body: "We ordered it on Tuesday. IT has it now and it should ship to your desk today. If it hasn't arrived by 5pm, tap below and we'll nudge IT for you.",
    bodyAr:
      "طلبناه يوم الثلاثاء. قسم تقنية المعلومات لديه الآن، ومن المفترض أن يصل إلى مكتبك اليوم. إن لم يصل بحلول الساعة الخامسة مساءً، اضغط أدناه وسنذكّر تقنية المعلومات نيابة عنك.",
    action: { label: "See the request", labelAr: "اعرض الطلب", view: "requests" },
    createdAt: iso(-2),
    category: "request",
  },
  {
    id: "N-1042-02",
    employeeId: "E-1042",
    type: "escalation",
    priority: "normal",
    title: "Fatima in HR claimed your case",
    titleAr: "تولّت فاطمة من الموارد البشرية قضيتك",
    body: "She's your named contact now. Expect a message from her today. You can see her details and reach out any time from your Me tab.",
    bodyAr:
      "هي جهة اتصالك المسمّاة الآن. انتظر رسالة منها اليوم. يمكنك الاطلاع على تفاصيلها والتواصل معها في أي وقت من تبويب حسابي.",
    action: { label: "See Fatima's details", labelAr: "تفاصيل فاطمة", view: "me" },
    createdAt: iso(-3),
    category: "hrbp",
  },
  {
    id: "N-1042-03",
    employeeId: "E-1042",
    type: "pulse_prompt",
    priority: "normal",
    title: "Pulse check available — 2 questions, only if you want to",
    titleAr: "فحص النبض متاح — سؤالان، فقط إن رغبت",
    body: "A quick read on how your first week is going. Skipped answers are never held against you. Pulse stays off until you say yes.",
    bodyAr:
      "قراءة سريعة لكيفية سير أسبوعك الأول. الإجابات المتخطّاة لا تُستخدم ضدّك أبداً. يبقى فحص النبض متوقّفاً حتى توافق.",
    action: { label: "Open pulse check", labelAr: "افتح فحص النبض", view: "today" },
    createdAt: iso(-4),
    category: "pulse",
  },
  {
    id: "N-1042-04",
    employeeId: "E-1042",
    type: "step_due",
    priority: "normal",
    title: "Buddy assignment pending HR",
    titleAr: "تعيين الرفيق معلّق لدى الموارد البشرية",
    body: "We asked HR to pair you with a buddy for your first month. This usually takes a day. You don't need to do anything — we'll let you know when it's done.",
    bodyAr:
      "طلبنا من الموارد البشرية إقرانك برفيق خلال شهرك الأول. يستغرق هذا عادةً يوماً. لا تحتاج لفعل أي شيء — سنخبرك عند الانتهاء.",
    action: { label: "See your journey", labelAr: "اعرض رحلتك", view: "journey" },
    createdAt: iso(-5),
    category: "journey",
  },
  {
    id: "N-1042-05",
    employeeId: "E-1042",
    type: "digest",
    priority: "low",
    title: "Daily digest: 2 items need your attention",
    titleAr: "ملخّص اليوم: عنصران بحاجة لاهتمامك",
    body: "Your laptop is late and your buddy is pending. Nothing else needs you today. We'll only message you again if something changes.",
    bodyAr: "حاسوبك متأخر ورفيقك معلّق. لا شيء آخر يحتاجك اليوم. لن نراسلك إلا إذا تغيّر شيء.",
    action: { label: "Open today", labelAr: "افتح اليوم", view: "today" },
    createdAt: iso(-1),
    category: "system",
  },
  {
    id: "N-1042-06",
    employeeId: "E-1042",
    type: "step_due",
    priority: "normal",
    title: "Training booking opens once access is provisioned",
    titleAr: "يُفتح حجز التدريب بمجرد توفير الوصول",
    body: "You can't book safety training until IT finishes your system access. We're watching that for you and will ping you the moment it clears.",
    bodyAr:
      "لا يمكنك حجز تدريب السلامة حتى يكمل تقنية المعلومات وصولك للأنظمة. نراقب ذلك من أجلك وسننبّهك فور اكتماله.",
    action: { label: "See your journey", labelAr: "اعرض رحلتك", view: "journey" },
    createdAt: iso(-30),
    category: "journey",
  },
  {
    id: "N-1042-07",
    employeeId: "E-1042",
    type: "request_update",
    priority: "normal",
    title: "Induction completed — well done",
    titleAr: "اكتمل التعريف — أحسنت",
    body: "Yesterday's induction is marked complete in your journey. One step closer to your role.",
    bodyAr: "تمّ وضع علامة اكتمل على تعريف الأمس في رحلتك. خطوة واحدة أقرب إلى دورك.",
    createdAt: iso(-26),
    readAt: iso(-25),
    category: "journey",
  },
  {
    id: "N-1042-08",
    employeeId: "E-1042",
    type: "system",
    priority: "low",
    title: "Welcome to ASTROLABE — your journey companion",
    titleAr: "مرحباً بك في ASTROLABE — رفيق رحلتك",
    body: "We're here to help you find your next step, ask a policy question, or just see where you stand. Ask us anything — every answer cites its source.",
    bodyAr:
      "نحن هنا لمساعدتك في إيجاد خطوتك التالية، أو طرح سؤال سياسات، أو رؤية أين تقف. اسألنا أي شيء — كل إجابة تستشهد بمصدرها.",
    createdAt: iso(-240),
    readAt: iso(-239),
    archivedAt: iso(-100),
    category: "system",
  },
];

/* ---------- in-memory mutation state (prototype only) ---------- */

interface Mutation {
  readAt?: string;
  snoozedUntil?: string;
  archivedAt?: string;
}

const mutations = new Map<string, Mutation>();
let killSwitchEnabled = false;

/* ---------- server-emitted notifications (prototype only) ----------
 * Anything the server decides the employee must be told — an escalation packet
 * being created, a case moving to a backup owner — lands here, in the same store
 * the inbox reads. A toast on a screen is not a notification: it disappears, it
 * is not in the inbox, and nothing can prove it happened.
 */
const emitted: Notification[] = [];
let emittedSeq = 0;

export interface NewNotification {
  employeeId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  category: NotificationCategory;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  action?: NotificationAction;
  createdAt?: string;
}

/**
 * Append one notification for an employee. Returns null (and files nothing) when
 * the kill switch is on — the caller is expected to record that it was
 * suppressed, not to pretend the employee was told.
 */
export function pushNotification(input: NewNotification): Notification | null {
  if (killSwitchEnabled) return null;
  emittedSeq += 1;
  const notification: Notification = {
    id: `N-EM-${input.employeeId}-${emittedSeq}`,
    employeeId: input.employeeId,
    type: input.type,
    priority: input.priority ?? "normal",
    title: input.title,
    titleAr: input.titleAr,
    body: input.body,
    bodyAr: input.bodyAr,
    action: input.action,
    createdAt: input.createdAt ?? NOW.toISOString(),
    category: input.category,
  };
  emitted.push(notification);
  return notification;
}

/** Everything emitted by the server for an employee, newest first. */
export function emittedNotifications(employeeId: string): Notification[] {
  return emitted
    .filter((n) => n.employeeId === employeeId)
    .map((n) => {
      const m = mutations.get(n.id);
      return m ? { ...n, ...m } : n;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getNotifications(employeeId: string): Notification[] {
  return [...BASE_NOTIFICATIONS, ...emitted]
    .filter((n) => n.employeeId === employeeId)
    .map((n) => {
      const m = mutations.get(n.id);
      return m ? { ...n, ...m } : n;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function isKillSwitchOn(): boolean {
  return killSwitchEnabled;
}

export function setKillSwitch(enabled: boolean): void {
  killSwitchEnabled = enabled;
}

export function markRead(id: string): string {
  const at = NOW.toISOString();
  const cur = mutations.get(id) ?? {};
  mutations.set(id, { ...cur, readAt: at });
  return at;
}

export function snooze(id: string, hours: number): string {
  const at = NOW.toISOString();
  const snoozedUntil = new Date(NOW.getTime() + hours * 3600 * 1000).toISOString();
  const cur = mutations.get(id) ?? {};
  mutations.set(id, { ...cur, snoozedUntil });
  return at;
}

export function archive(id: string): string {
  const at = NOW.toISOString();
  const cur = mutations.get(id) ?? {};
  mutations.set(id, { ...cur, archivedAt: at });
  return at;
}
