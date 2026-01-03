import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

const SelectContext = React.createContext<any>(null)

const Select = ({ children, value, onValueChange }: any) => {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <div ref={containerRef} className="relative w-full">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

const SelectTrigger = React.forwardRef<any, any>(({ className, children, ...props }, ref) => {
  const { open, setOpen } = React.useContext(SelectContext)
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOpen(!open)
      }}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform duration-200", open && "rotate-180")} />
    </button>
  )
})
SelectTrigger.displayName = "SelectTrigger"

const SelectValue = ({ placeholder }: any) => {
  const { value } = React.useContext(SelectContext)
  return <span className="block truncate">{value || placeholder}</span>
}

const SelectContent = ({ children, className }: any) => {
  const { open } = React.useContext(SelectContext)
  if (!open) return null

  return (
    <div 
      className={cn(
        "absolute left-0 top-full z-[10001] mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white p-1 text-base shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-slate-100 focus:outline-none sm:text-sm animate-in fade-in zoom-in-95 duration-200", 
        className
      )}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

const SelectItem = React.forwardRef<any, any>(({ className, children, value: itemValue, ...props }, ref) => {
  const { onValueChange, setOpen } = React.useContext(SelectContext)
  
  return (
    <div
      ref={ref}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onValueChange(itemValue)
        setOpen(false)
      }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2 px-3 text-sm font-medium outline-none hover:bg-indigo-50 hover:text-indigo-600 focus:bg-indigo-50 focus:text-indigo-600 transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="block truncate">{children}</span>
    </div>
  )
})
SelectItem.displayName = "SelectItem"

const SelectGroup = ({ children }: any) => <div>{children}</div>

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
}
