import * as React from "react"
import { cn } from "@/lib/utils"

const Card = ({ className, ...props }: any) => (
  <div className={cn("rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm", className)} {...props} />
)
const CardHeader = ({ className, ...props }: any) => (
  <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
)
const CardTitle = ({ className, ...props }: any) => (
  <h3 className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
)
const CardDescription = ({ className, ...props }: any) => (
  <p className={cn("text-sm text-slate-500", className)} {...props} />
)
const CardContent = ({ className, ...props }: any) => (
  <div className={cn("p-6 pt-0", className)} {...props} />
)
const CardFooter = ({ className, ...props }: any) => (
  <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
)

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
