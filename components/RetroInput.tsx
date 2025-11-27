import React from 'react';

interface RetroInputProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}

const RetroInput: React.FC<RetroInputProps> = ({ label, value, onChange, placeholder, type = "text" }) => {
  return (
    <div className="flex flex-col gap-1 mb-4">
      <label className="text-amber-500 text-sm uppercase tracking-wider">{label}</label>
      <div className="relative group">
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full bg-black border-2 border-amber-700 text-amber-400 p-2 font-mono text-lg outline-none focus:border-amber-400 focus:shadow-[0_0_10px_rgba(255,176,0,0.5)] transition-all placeholder-amber-900"
        />
        <div className="absolute right-2 top-3 w-2 h-4 bg-amber-500 animate-pulse pointer-events-none opacity-50" />
      </div>
    </div>
  );
};

export default RetroInput;