"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileSpreadsheet, Printer } from "lucide-react";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function shift(dateStr: string, days: number) { const d = new Date(dateStr + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return iso(d); }
function weekStart(dateStr: string) { const d = new Date(dateStr + "T12:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return iso(d); }

/**
 * Site Diary Record download — the diary on paper, one page per day per
 * author, plus a CSV. Managers get every author; others their own days.
 */
export function DiaryRecordDownload({ projectId, today }: { projectId: string; today: string }) {
  const [from, setFrom] = useState(weekStart(today));
  const [to, setTo] = useState(today);
  const url = (format: "pdf" | "csv") => `/api/diary-record?projectId=${projectId}&from=${from}&to=${to}&format=${format}`;
  const preset = (label: string, f: string, t: string) => (
    <button type="button" onClick={() => { setFrom(f); setTo(t); }} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">{label}</button>
  );
  const monthStart = today.slice(0, 8) + "01";
  const lastMonthEnd = shift(monthStart, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + "01";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Printer className="h-4 w-4" /> Print or download the diary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The full record, one page per day: crew and kit, works done by activity, hold-ups, people and safety, notes, photos, amendments, and the entered, received and locked times. An internal document that prints names. Up to 62 days at a time.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {preset("Today", today, today)}
          {preset("This week", weekStart(today), today)}
          {preset("Last week", shift(weekStart(today), -7), shift(weekStart(today), -1))}
          {preset("This month", monthStart, today)}
          {preset("Last month", lastMonthStart, lastMonthEnd)}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label htmlFor="dr-from" className="text-xs">From</Label><Input id="dr-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label htmlFor="dr-to" className="text-xs">To</Label><Input id="dr-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="h-9" /></div>
          <a href={url("pdf")} target="_blank" rel="noopener" className="inline-flex"><Button type="button" size="sm"><Download className="mr-1.5 h-4 w-4" /> PDF</Button></a>
          <a href={url("csv")} className="inline-flex"><Button type="button" size="sm" variant="outline"><FileSpreadsheet className="mr-1.5 h-4 w-4" /> CSV</Button></a>
        </div>
      </CardContent>
    </Card>
  );
}
