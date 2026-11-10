import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color?: string;
  trend?: { value: number; label: string };
}

export default function KpiCard({ title, value, subtitle, icon, color = 'blue', trend }: KpiCardProps) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    teal: 'bg-teal-50 text-teal-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="card min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 ${colors[color] || colors.blue}`}>
          {icon}
        </div>
        <p className="text-xs sm:text-sm text-gray-500 font-medium leading-snug">{title}</p>
      </div>
      <p className="text-base sm:text-2xl font-bold text-gray-900 leading-tight break-words">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      {trend && (
        <p className={`text-xs mt-1 font-medium ${trend.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </div>
  );
}
