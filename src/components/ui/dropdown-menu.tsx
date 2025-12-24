import * as React from "react"
import { cn } from "@/lib/utils"

const DropdownMenu = ({ children }: any) => {
  return <div className="relative inline-block text-left">{children}</div>
}

const DropdownMenuTrigger = React.forwardRef<any, any>(({ asChild, children, ...props }, ref) => {
  return <div ref={ref} {...props}>{children}</div>
})
DropdownMenuTrigger.displayName = "DropdownMenuTrigger"

const DropdownMenuContent = ({ className, children, ...props }: any) => (
  <div className={cn("absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none", className)} {...props}>
    <div className="py-1">{children}</div>
  </div>
)

const DropdownMenuItem = ({ className, children, ...props }: any) => (
  <button className={cn("flex w-full items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-100", className)} {...props}>
    {children}
  </button>
)

const DropdownMenuLabel = ({ className, ...props }: any) => (
  <div className={cn("px-4 py-2 text-sm font-semibold text-slate-900", className)} {...props} />
)

const DropdownMenuSeparator = ({ className, ...props }: any) => (
  <div className={cn("-mx-1 my-1 h-px bg-slate-100", className)} {...props} />
)

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
}
