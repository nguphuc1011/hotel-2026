import { cn } from '@/lib/utils'; 

export function BentoCard({ children, className, onClick, variant = 'small' }: any) { 
  return ( 
    <div 
      onClick={onClick} 
      className={cn( 
        "bento-card p-6 flex flex-col justify-between", 
        variant === 'large' ? "md:col-span-2 min-h-[280px]" : "col-span-1 min-h-[200px]", 
        className 
      )} 
    > 
      {children} 
    </div> 
  ); 
}
