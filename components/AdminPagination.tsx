import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const AdminPagination: React.FC<AdminPaginationProps> = ({ page, pageSize, total, onPageChange }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-3 border-t border-nano-border bg-black/60 px-4 py-3 text-xs text-nano-text sm:flex-row sm:items-center sm:justify-between">
      <div>
        Showing <span className="font-mono text-white">{start}-{end}</span> of <span className="font-mono text-white">{total}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded border border-nano-border bg-white/5 px-3 py-1.5 font-bold uppercase tracking-wider text-nano-text hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="font-mono text-[11px] text-gray-400">
          Page {page} / {pageCount}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="inline-flex items-center gap-1 rounded border border-nano-border bg-white/5 px-3 py-1.5 font-bold uppercase tracking-wider text-nano-text hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default AdminPagination;
