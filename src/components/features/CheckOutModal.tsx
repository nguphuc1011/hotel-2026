'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Room } from '@/types';
import { CheckOutForm } from './CheckOutForm';

interface CheckOutModalProps {
  room: Room | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCheckoutSuccess: () => void;
}

export function CheckOutModal({ room, isOpen, onOpenChange, onCheckoutSuccess }: CheckOutModalProps) {
  if (!room) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thanh toán - Phòng {room.room_number}</DialogTitle>
        </DialogHeader>
        <CheckOutForm room={room} onCheckoutSuccess={onCheckoutSuccess} />
      </DialogContent>
    </Dialog>
  );
}
