import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatCurrency } from '../lib/utils';

interface Line {
  label: string;
  actual: number;
  target: number;
  money?: boolean;
  period: 'today' | 'month';
}

interface PersonPlan {
  id: string;
  name: string;
  email: string;
  title: string;
  focus: string;
  summary: string;
  lines: Line[];
}

interface Report {
  month: string;
  today: string;
  workingDays: number;
  workingDaysElapsed: number;
  week: string;
  people: PersonPlan[];
}

function show(line: Line) {
  if (line.money) return formatCurrency(line.actual);
  return String(line.actual);
}

function targetText(line: Line) {
  if (line.target <= 0) return '';
  return line.money ? formatCurrency(line.target) : String(line.target);
}

function Bar({ line }: { line: Line }) {
  if (line.target <= 0) {
    return (
      <div className="flex items-center justify-between text-sm py-1">
        <span className="text-gray-600">{line.label}</span>
        <span className="font-semibold text-gray-900">{show(line)}</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((line.actual / line.target) * 100));
  const tone = pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        <span>{line.label}</span>
        <span className="font-medium text-gray-900">{show(line)} / {targetText(line)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SalesPlanBoard({ month, compact = false }: { month: string; compact?: boolean }) {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    api.get<Report>(`/sales-plans?month=${month}`).then(setReport).catch(() => setReport(null));
  }, [month]);

  if (!report?.people?.length) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Sales team plan</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {report.workingDays} working days in this month ({report.week}). {report.workingDaysElapsed} of them have passed.
          Agent conversations, meetings, visits, and WhatsApp groups are logged on the agent. Event talks are Events calls. Incoming calls use the Inbound type. A close is a Closed Won lead.
        </p>
      </div>
      <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
        {report.people.map(person => {
          const today = person.lines.filter(l => l.period === 'today');
          const monthLines = person.lines.filter(l => l.period === 'month');
          return (
            <div key={person.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-semibold text-gray-900">{person.name}</p>
                  <p className="text-xs text-blue-700 font-medium">{person.title}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-3">{person.summary}</p>
              {today.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Today</p>
                  {today.map(line => <Bar key={line.label + line.period} line={line} />)}
                </div>
              )}
              {monthLines.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">This month</p>
                  {monthLines.map(line => <Bar key={line.label + line.period} line={line} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
