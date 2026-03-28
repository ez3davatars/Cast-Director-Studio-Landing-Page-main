import React from 'react';
import { Search } from 'lucide-react';

interface AdminSearchFilterProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

const AdminSearchFilter: React.FC<AdminSearchFilterProps> = ({ value, onChange, placeholder = 'Search...' }) => {
  return (
    <div className="relative max-w-md w-full mb-6">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
        <Search size={16} />
      </div>
      <input
        type="text"
        className="w-full pl-10 pr-4 py-2 bg-black border border-nano-border rounded text-sm text-white focus:outline-none focus:border-nano-yellow focus:ring-1 focus:ring-nano-yellow transition-all placeholder:text-gray-600 font-mono"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

export default AdminSearchFilter;
