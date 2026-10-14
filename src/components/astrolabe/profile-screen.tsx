"use client";

import { motion } from "framer-motion";
import {
  UserCircle, Mail, Phone, MapPin, Calendar, Briefcase, Users,
  ShieldCheck, Edit3, Download,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface ProfileData {
  displayName: string;
  displayNameAr?: string;
  role: string;
  roleAr?: string;
  team: string;
  location: string;
  email: string;
  phone: string;
  startDate: string;
  manager: { name: string; role: string };
  hrbp: { name: string; role: string };
  journeyType: string;
  stage: string;
  dayInStage: number;
}

export function ProfileScreen() {
  const locale = useAppStore((s) => s.locale);
  const employeeId = useAppStore((s) => s.currentEmployeeId);
  const setView = useAppStore((s) => s.setView);
  const ar = locale === "ar";
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/journey/me?employeeId=${employeeId}&asOf=2024-10-19T10:00:00.000Z`);
        const json = await res.json();
        if (json.ok && json.data) {
          const e = json.data.employee;
          setData({
            displayName: e.displayName,
            displayNameAr: e.displayNameAr,
            role: e.role,
            roleAr: e.roleAr,
            team: e.team,
            location: e.location,
            email: `${e.id.toLowerCase()}@astrolabe.internal`,
            phone: "+971 50 123 4567",
            startDate: e.startDate,
            manager: e.manager || { name: "Not assigned", role: "" },
            hrbp: e.hrbp || { name: "Not assigned", role: "" },
            journeyType: e.journeyType,
            stage: json.data.stage,
            dayInStage: json.data.dayInStage,
          });
        }
      } catch { /* noop */ } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  if (loading) {
    return (
      <div className="max-w-[700px] mx-auto px-4 py-10">
        <div className="ast-card h-64 ast-shimmer rounded-[14px]" />
      </div>
    );
  }

  if (!data) return null;

  const name = ar && data.displayNameAr ? data.displayNameAr : data.displayName;
  const role = ar && data.roleAr ? data.roleAr : data.role;

  return (
    <div dir={ar ? "rtl" : "ltr"} className="max-w-[700px] mx-auto px-4 sm:px-6 py-6 lg:py-10 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--brand-400)" }}>
          <UserCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>{ar ? "ملفك" : "Your profile"}</span>
        </div>
        <h1 className="mt-2 text-[28px] sm:text-[32px] font-semibold tracking-tight" style={{ color: "var(--text-hi)" }}>
          {name}
        </h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--text-mid)" }}>
          {role} · {data.team}
        </p>
      </div>

      {/* Profile card with avatar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="ast-card p-6 flex items-center gap-5"
      >
        <div
          className="flex items-center justify-center w-20 h-20 rounded-full text-[28px] font-bold shrink-0"
          style={{
            background: "radial-gradient(circle at 30% 30%, rgba(22,154,165,0.25), rgba(11,17,28,0.4))",
            border: "2px solid rgba(22,154,165,0.35)",
            color: "var(--brand-400)",
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[20px] font-semibold" style={{ color: "var(--text-hi)" }}>{name}</h2>
          <p className="text-[13px]" style={{ color: "var(--text-mid)" }}>{role}</p>
          <div className="flex items-center gap-3 mt-2 text-[12px] tabular" style={{ color: "var(--text-lo)" }}>
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" strokeWidth={1.75} /> {data.location}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" strokeWidth={1.75} /> {ar ? "يوم" : "Day"} {data.dayInStage}
            </span>
          </div>
        </div>
        <button
          onClick={() => toast.success(ar ? "فتح التحرير" : "Edit mode opening…")}
          className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium shrink-0"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
        >
          <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span className="hidden sm:inline">{ar ? "تحرير" : "Edit"}</span>
        </button>
      </motion.div>

      {/* Details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DetailCard icon={Mail} label={ar ? "البريد" : "Email"} value={data.email} />
        <DetailCard icon={Phone} label={ar ? "الهاتف" : "Phone"} value={data.phone} />
        <DetailCard icon={Briefcase} label={ar ? "الدور" : "Role"} value={role} />
        <DetailCard icon={Users} label={ar ? "الفريق" : "Team"} value={data.team} />
        <DetailCard icon={MapPin} label={ar ? "الموقع" : "Location"} value={data.location} />
        <DetailCard icon={Calendar} label={ar ? "تاريخ البدء" : "Start date"} value={data.startDate.slice(0, 10)} />
      </div>

      {/* Manager + HRBP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="ast-card p-5">
          <p className="text-[10px] uppercase tracking-[0.14em] mb-2" style={{ color: "var(--text-lo)" }}>
            {ar ? "مديرك" : "Your manager"}
          </p>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-hi)" }}>{data.manager.name}</p>
          <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>{data.manager.role}</p>
        </div>
        <div className="ast-card p-5">
          <p className="text-[10px] uppercase tracking-[0.14em] mb-2" style={{ color: "var(--text-lo)" }}>
            {ar ? "شريك الموارد البشرية" : "Your HRBP"}
          </p>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-hi)" }}>{data.hrbp.name}</p>
          <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>{data.hrbp.role}</p>
        </div>
      </div>

      {/* Journey summary */}
      <div className="ast-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {ar ? "حالة الرحلة" : "Journey status"}
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>{ar ? "النوع" : "Type"}</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: "var(--brand-400)" }}>
              {data.journeyType === "onboarding" ? (ar ? "التحاق" : "Onboarding") : (ar ? "تنقل" : "Mobility")}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>{ar ? "المرحلة" : "Stage"}</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: "var(--text-hi)" }}>{data.stage}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>{ar ? "اليوم" : "Day"}</p>
            <p className="text-[14px] font-semibold mt-1 tabular" style={{ color: "var(--accent-500)" }}>{data.dayInStage}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setView("me")}
          className="ast-focus inline-flex items-center gap-2 h-11 px-5 rounded-[10px] text-[13px] font-semibold"
          style={{ background: "var(--brand-500)", color: "var(--surface-0)" }}
        >
          <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
          {ar ? "الخصوصية والبيانات" : "Privacy & data"}
        </button>
        <button
          onClick={() => toast.success(ar ? "جارٍ التصدير…" : "Exporting…")}
          className="ast-focus inline-flex items-center gap-2 h-11 px-5 rounded-[10px] text-[13px] font-medium"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
        >
          <Download className="w-4 h-4" strokeWidth={1.75} />
          {ar ? "تصدير ملفي" : "Export my profile"}
        </button>
      </div>
    </div>
  );
}

function DetailCard({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="ast-card p-4 flex items-center gap-3">
      <div className="flex items-center justify-center w-9 h-9 rounded-full shrink-0" style={{ background: "rgba(22,154,165,0.08)", color: "var(--brand-400)" }}>
        <Icon className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>{label}</p>
        <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-hi)" }}>{value}</p>
      </div>
    </div>
  );
}
