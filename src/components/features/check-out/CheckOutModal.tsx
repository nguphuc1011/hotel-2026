"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { differenceInHours, format } from "date-fns"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Service, Room, Booking, Setting } from "@/types"
import { calculateStayDetails } from "@/lib/calculation"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

interface CheckOutModalProps {
  isOpen: boolean
  onClose: () => void
  room: Room
  settings: Setting[]
  services: Service[]
  onConfirm: (checkoutData: {
    bookingId: string
    paymentMethod: string
    services: any[]
    totalAmount: number
  }) => void
}

export function CheckOutModal({
  isOpen,
  onClose,
  room,
  settings,
  services: allServices,
  onConfirm,
}: CheckOutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [usedServices, setUsedServices] = useState<
    { service_id: string; quantity: number; price: number }[]
  >([])

  if (!room || !room.bookings) {
    return null
  }

  const booking = room.bookings
  const timeRules = settings.find(s => s.key === "time_rules")?.value

  const { total, nights, hours, isOvernight, roomCharge } = calculateStayDetails(
    booking.check_in_at,
    new Date().toISOString(),
    booking.rental_type,
    booking.initial_price,
    timeRules
  )

  const servicesTotal = usedServices.reduce(
    (acc, service) => acc + service.price * service.quantity,
    0
  )
  const totalAmount = roomCharge + servicesTotal

  const handleAddService = (serviceId: string) => {
    const service = allServices.find(s => s.id === serviceId)
    if (!service) return

    setUsedServices(prev => {
      const existing = prev.find(s => s.service_id === serviceId)
      if (existing) {
        return prev.map(s =>
          s.service_id === serviceId ? { ...s, quantity: s.quantity + 1 } : s
        )
      }
      return [...prev, { service_id: serviceId, quantity: 1, price: service.price }]
    })
  }

  const handleConfirm = () => {
    onConfirm({
      bookingId: booking.id,
      paymentMethod,
      services: usedServices,
      totalAmount,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass flex h-[90vh] max-w-2xl flex-col border-zinc-700 bg-zinc-900/80 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl">Thanh toán: Phòng {room.room_number}</DialogTitle>
          <DialogDescription>
            Kiểm tra chi tiết hoá đơn và xác nhận thanh toán.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {/* Guest & Stay Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-zinc-700 p-4">
                <h3 className="mb-2 font-semibold text-lg">Thông tin khách</h3>
                <p>
                  <strong>Tên:</strong> {booking.customers?.full_name || "Khách vãng lai"}
                </p>
                <p>
                  <strong>SĐT:</strong> {booking.customers?.phone || "N/A"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-700 p-4">
                <h3 className="mb-2 font-semibold text-lg">Thông tin Aufenthalt</h3>
                <p>
                  <strong>Check-in:</strong> {format(new Date(booking.check_in_at), "HH:mm dd/MM/yyyy")}
                </p>
                <p>
                  <strong>Loại thuê:</strong> {booking.rental_type}
                </p>
              </div>
            </div>

            {/* Charges Summary */}
            <div className="rounded-lg border border-zinc-700 p-4">
              <h3 className="mb-2 font-semibold text-lg">Chi tiết hoá đơn</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>
                    Tiền phòng ({isOvernight ? "Qua đêm" : `${nights} đêm ${hours} giờ`})
                  </span>
                  <span>{roomCharge.toLocaleString()} VNĐ</span>
                </div>
                <Separator className="bg-zinc-600" />
                <p className="font-semibold">Dịch vụ đã sử dụng:</p>
                {usedServices.length === 0 && (
                  <p className="text-sm text-zinc-400">Chưa có dịch vụ nào.</p>
                )}
                {usedServices.map(service => {
                  const serviceInfo = allServices.find(s => s.id === service.service_id)
                  return (
                    <div key={service.service_id} className="flex justify-between pl-4">
                      <span>
                        {serviceInfo?.name} x {service.quantity}
                      </span>
                      <span>{(service.price * service.quantity).toLocaleString()} VNĐ</span>
                    </div>
                  )
                })}
                <Separator className="bg-zinc-600" />
                <div className="flex justify-between text-xl font-bold">
                  <span>Tổng cộng</span>
                  <span>{totalAmount.toLocaleString()} VNĐ</span>
                </div>
              </div>
            </div>

            {/* Add Services */}
            <div className="rounded-lg border border-zinc-700 p-4">
              <h3 className="mb-2 font-semibold text-lg">Thêm dịch vụ</h3>
              <div className="flex gap-2">
                <Select onValueChange={handleAddService}>
                  <SelectTrigger className="flex-1 bg-zinc-800 border-zinc-600">
                    <SelectValue placeholder="Chọn dịch vụ..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 text-white border-zinc-700">
                    {allServices.map(service => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name} ({service.price.toLocaleString()} VNĐ)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Payment Method */}
            <div className="rounded-lg border border-zinc-700 p-4">
              <h3 className="mb-2 font-semibold text-lg">Phương thức thanh toán</h3>
              <div className="flex gap-2">
                <Button
                  variant={paymentMethod === "cash" ? "secondary" : "outline"}
                  onClick={() => setPaymentMethod("cash")}
                  className="flex-1"
                >
                  Tiền mặt
                </Button>
                <Button
                  variant={paymentMethod === "card" ? "secondary" : "outline"}
                  onClick={() => setPaymentMethod("card")}
                  className="flex-1"
                >
                  Thẻ
                </Button>
                <Button
                  variant={paymentMethod === "transfer" ? "secondary" : "outline"}
                  onClick={() => setPaymentMethod("transfer")}
                  className="flex-1"
                >
                  Chuyển khoản
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Xác nhận thanh toán
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
