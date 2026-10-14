"use client";

import { motion } from "framer-motion";
import {
  HelpCircle,
  BookOpen,
  MessageSquare,
  Phone,
  Mail,
  Compass,
  ChevronRight,
  Search,
  Lightbulb,
  Users,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { useState } from "react";

const HELP_TOPICS = [
  {
    id: "getting-started",
    icon: Compass,
    title: "Getting started",
    titleAr: "البدء",
    desc: "Learn how ASTROLABE guides your onboarding journey",
    descAr: "تعلّم كيف يرشدك ASTROLABE في رحلة الالتحاق",
    items: [
      "How to read your Today screen",
      "Understanding your journey map",
      "What the band colors mean",
      "When to expect nudges",
    ],
  },
  {
    id: "asking-questions",
    icon: MessageSquare,
    title: "Asking policy questions",
    titleAr: "طرح أسئلة السياسة",
    desc: "How to get cited answers from official policies",
    descAr: "كيف تحصل على إجابات مستشهدة من السياسات الرسمية",
    items: [
      "What makes a good question",
      "Understanding citations",
      "When ASTROLABE abstains",
      "Using the source preview",
    ],
  },
  {
    id: "requests",
    icon: BookOpen,
    title: "Starting requests",
    titleAr: "بدء الطلبات",
    desc: "How to submit complete, correctly-routed requests",
    descAr: "كيف تقدم طلبات كاملة وموجهة بشكل صحيح",
    items: [
      "Choosing the right request type",
      "What prefilled means",
      "Tracking your request",
      "When you get a 'needs more info'",
    ],
  },
  {
    id: "privacy",
    icon: Users,
    title: "Your privacy",
    titleAr: "خصوصيتك",
    desc: "How consent works and what we never do",
    descAr: "كيف تعمل الموافقة وما لا نفعله أبداً",
    items: [
      "What consent controls",
      "What managers can't see",
      "How to revoke consent",
      "Your data export rights",
    ],
  },
];

const CONTACTS = [
  {
    name: "Fatima Al-Mansouri",
    role: "HRBP — Cabin Crew",
    email: "fatima.hrbp@astrolabe.internal",
    icon: Users,
  },
  {
    name: "ASTROLABE Support",
    role: "24/7 in-app support",
    email: "support@astrolabe.internal",
    icon: Mail,
  },
];

const FAQS = [
  {
    q: "Why does ASTROLABE say 'I'm not sure'?",
    a: "When we can't find a clear answer in the policy documents, we tell you and hand you to the right person. We never guess.",
  },
  {
    q: "Can my manager see my pulse responses?",
    a: "No. Managers see only their own obligations and aggregate completion. Sentiment, pulse scores, and comments are structurally absent from the manager API.",
  },
  {
    q: "What happens when I revoke consent?",
    a: "The dependent signal family is immediately suppressed. Your band recomputes without it. You get a timestamped receipt.",
  },
  {
    q: "Is ASTROLABE used for performance reviews?",
    a: "No. ASTROLABE output is structurally blocked from use in performance, disciplinary, promotion, or visa decisions. This is enforced at the query layer.",
  },
  {
    q: "How do I export my data?",
    a: "Go to Me → Data held about me → Export. You can download everything as JSON or request a PDF.",
  },
];

export function HelpScreen() {
  const locale = useAppStore((s) => s.locale);
  const setView = useAppStore((s) => s.setView);
  const ar = locale === "ar";
  const [search, setSearch] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const filteredTopics = HELP_TOPICS.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.desc.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      dir={ar ? "rtl" : "ltr"}
      className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 lg:py-10 space-y-8"
    >
      {/* Header */}
      <div>
        <div
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--brand-400)" }}
        >
          <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>{ar ? "مركز المساعدة" : "Help center"}</span>
        </div>
        <h1
          className="mt-2 text-[28px] sm:text-[32px] font-semibold tracking-tight"
          style={{ color: "var(--text-hi)" }}
        >
          {ar ? "كيف يمكننا مساعدتك؟" : "How can we help?"}
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: "var(--text-mid)" }}>
          {ar
            ? "أجوبة سريعة، أدلة، وطرق للتواصل مع من يعرف."
            : "Quick answers, guides, and ways to reach someone who knows."}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          strokeWidth={1.75}
          style={{ color: "var(--text-lo)" }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={ar ? "ابحث في المساعدة…" : "Search help…"}
          className="ast-focus w-full h-12 pl-10 pr-4 rounded-[14px] text-[14px] outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            color: "var(--text-hi)",
          }}
        />
      </div>

      {/* Quick tips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: Lightbulb,
            label: ar ? "نصيحة: استخدم تبويب اليوم أولاً" : "Tip: Check Today first",
            color: "var(--accent-500)",
          },
          {
            icon: Clock,
            label: ar ? "نرد خلال 4 ساعات" : "We reply within 4 hours",
            color: "var(--brand-400)",
          },
          {
            icon: ShieldCheck,
            label: ar ? "خصوصيتك محمية" : "Your privacy is protected",
            color: "var(--status-steady)",
          },
        ].map((tip, i) => {
          const Icon = tip.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="ast-card p-4 flex items-center gap-3"
            >
              <div
                className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                style={{ background: `${tip.color}15`, color: tip.color }}
              >
                <Icon className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <span className="text-[12px] font-medium" style={{ color: "var(--text-hi)" }}>
                {tip.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Help topics */}
      <div>
        <h2 className="text-[18px] font-semibold mb-4" style={{ color: "var(--text-hi)" }}>
          {ar ? "أدلة" : "Guides"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredTopics.map((topic, i) => {
            const Icon = topic.icon;
            return (
              <motion.button
                key={topic.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -2 }}
                className="ast-card p-5 text-left ast-focus"
                style={{ cursor: "pointer" }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
                    style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-semibold" style={{ color: "var(--text-hi)" }}>
                      {ar ? topic.titleAr : topic.title}
                    </h3>
                    <p
                      className="text-[12px] mt-1 leading-relaxed"
                      style={{ color: "var(--text-mid)" }}
                    >
                      {ar ? topic.descAr : topic.desc}
                    </p>
                    <ul className="mt-3 space-y-1">
                      {topic.items.map((item, j) => (
                        <li
                          key={j}
                          className="flex items-center gap-2 text-[11px]"
                          style={{ color: "var(--text-lo)" }}
                        >
                          <ChevronRight
                            className="w-3 h-3 shrink-0"
                            strokeWidth={1.75}
                            style={{ color: "var(--brand-400)" }}
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-[18px] font-semibold mb-4" style={{ color: "var(--text-hi)" }}>
          {ar ? "أسئلة شائعة" : "Frequently asked"}
        </h2>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="ast-card overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="ast-focus w-full flex items-center justify-between gap-3 p-4 text-left"
              >
                <span className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
                  {faq.q}
                </span>
                <ChevronRight
                  className="w-4 h-4 shrink-0 transition-transform"
                  strokeWidth={1.75}
                  style={{
                    color: "var(--text-lo)",
                    transform: openFaq === i ? "rotate(90deg)" : "none",
                  }}
                />
              </button>
              {openFaq === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  className="px-4 pb-4"
                >
                  <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
                    {faq.a}
                  </p>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contacts */}
      <div>
        <h2 className="text-[18px] font-semibold mb-4" style={{ color: "var(--text-hi)" }}>
          {ar ? "تواصل مع شخص" : "Talk to a person"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CONTACTS.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} className="ast-card p-4 flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
                  style={{ background: "rgba(201,162,39,0.10)", color: "var(--accent-500)" }}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
                    {c.name}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-lo)" }}>
                    {c.role}
                  </p>
                  <a
                    href={`mailto:${c.email}`}
                    className="text-[11px] tabular hover:underline"
                    style={{ color: "var(--brand-400)" }}
                  >
                    {c.email}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
