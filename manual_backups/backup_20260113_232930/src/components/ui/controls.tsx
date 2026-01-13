'use client'; import { cn } from "@/lib/utils"; 
export const Switch = ({ checked, onChange }: any) => ( 
  <button onClick={() => onChange(!checked)} className={cn("w-12 h-7 rounded-full transition-all relative", checked ? "bg-[#34C759]" : "bg-gray-300")}> 
    <div className={cn("absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-sm", checked ? "left-6" : "left-1")} /> 
  </button> 
); 
export const SegmentedControl = ({ options, value, onChange }: any) => ( 
  <div className="flex bg-black/5 p-1 rounded-2xl w-full"> 
    {options.map((opt: any) => ( 
      <button key={opt.value} onClick={() => onChange(opt.value)} className={cn("flex-1 py-2 text-[15px] font-bold rounded-xl transition-all", value === opt.value ? "bg-white text-black shadow-sm" : "opacity-40")}> 
        {opt.label} 
      </button> 
    ))} 
  </div> 
);