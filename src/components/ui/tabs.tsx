import * as React from "react"
import { cn } from "@/lib/utils"

const Tabs = ({ children, value, onValueChange, className }: any) => (
  <div className={cn("w-full", className)} data-state={value}>{children}</div>
)
const TabsList = ({ className, ...props }: any) => (
  <div className={cn("inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500", className)} {...props} />
)
const TabsTrigger = ({ className, value, children, ...props }: any) => (
  <button className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm", className)} {...props} />
)
const TabsContent = ({ className, value, ...props }: any) => (
  <div className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)} {...props} />
)

export { Tabs, TabsList, TabsTrigger, TabsContent }
