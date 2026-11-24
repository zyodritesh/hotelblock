import React from 'react';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  pageSizes?: number[];
}

export default function Pagination({ page, pageSize, total, onPage, onPageSize, pageSizes = [25, 50, 100] }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages = () => {
    const p: (number | '…')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) p.push(i);
    } else {
      p.push(1);
      if (page > 3) p.push('…');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) p.push(i);
      if (page < totalPages - 2) p.push('…');
      p.push(totalPages);
    }
    return p;
  };

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>{total === 0 ? '0 results' : `${from}–${to} of ${total}`}</span>
        {onPageSize && (
          <select
            value={pageSize}
            onChange={e => { onPageSize(Number(e.target.value)); onPage(1); }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
          >
            {pageSizes.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50 text-sm"
        >‹</button>

        {pages().map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${page === p ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >{p}</button>
          )
        )}

        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50 text-sm"
        >›</button>
      </div>
    </div>
  );
}
