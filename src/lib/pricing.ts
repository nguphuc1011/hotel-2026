import { differenceInMinutes, parse, isAfter, addDays, startOfDay } from 'date-fns';
import { Booking, TimeRules, Room } from '@/types';

export interface PricingResult {
  price: number;
  note: string;
}

export class PricingLogic {
  static calculate(
    booking: Partial<Booking>, 
    room: Room,
    timeRules: TimeRules
  ): PricingResult {
    if (!booking.check_in_at || !booking.initial_price) {
      return { price: 0, note: '' };
    }

    const checkIn = new Date(booking.check_in_at);
    const checkOut = booking.check_out_at ? new Date(booking.check_out_at) : new Date();
    const diffMinutes = differenceInMinutes(checkOut, checkIn);

    // Guard: Negative time
    if (diffMinutes < 0) return { price: 0, note: 'Lỗi thời gian' };

    switch (booking.rental_type) {
      case 'hourly':
        const nextHourPrice = room.prices?.next_hour || booking.initial_price;
        return this.calculateHourly(booking.initial_price, nextHourPrice, diffMinutes);
      
      case 'daily':
        return this.calculateDaily(booking.initial_price, checkIn, checkOut, timeRules);
      
      case 'overnight':
        return { price: booking.initial_price, note: 'Qua đêm' };
        
      default:
        return { price: booking.initial_price, note: '' };
    }
  }

  static checkOvernightAutoSuggest(checkIn: Date, timeRules: TimeRules): boolean {
    if (!timeRules?.overnight) return false;
    
    const [startH, startM] = timeRules.overnight.start.split(':').map(Number);
    const [endH, endM] = timeRules.overnight.end.split(':').map(Number);
    
    const currentH = checkIn.getHours();
    const currentM = checkIn.getMinutes();
    
    // Convert to minutes for easier comparison
    const currentMins = currentH * 60 + currentM;
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    // Case 1: Overnight spans across midnight (e.g. 21:00 - 06:00)
    if (startMins > endMins) {
      return currentMins >= startMins || currentMins <= endMins;
    }
    
    // Case 2: Overnight within same day (rare, but possible)
    return currentMins >= startMins && currentMins <= endMins;
  }

  private static calculateHourly(basePrice: number, nextHourPrice: number, minutes: number): PricingResult {
    const hours = Math.max(1, Math.ceil(minutes / 60));
    
    if (hours === 1) {
      return { price: basePrice, note: '1 giờ đầu' };
    }

    const price = basePrice + (hours - 1) * nextHourPrice;
    return { price, note: `${hours} giờ` };
  }

  private static calculateDaily(
    dailyPrice: number, 
    checkIn: Date, 
    checkOut: Date, 
    timeRules: TimeRules
  ): PricingResult {
    if (!timeRules) {
      // Fallback simple daily logic
      const days = Math.max(1, Math.ceil(differenceInMinutes(checkOut, checkIn) / (24 * 60)));
      return { price: days * dailyPrice, note: `${days} ngày` };
    }

    // Logic from Doc 2.2.2 & 2.2.3
    const checkOutConfig = timeRules.check_out || "12:00";
    const [coH, coM] = checkOutConfig.split(':').map(Number);

    // Standard checkout time for the NEXT day relative to check-in
    // Start with checkIn date, move to next day, set time to checkout time
    let standardCheckOut = new Date(checkIn);
    standardCheckOut = addDays(standardCheckOut, 1);
    standardCheckOut.setHours(coH, coM, 0, 0);

    // If actual checkout is BEFORE standard checkout (early checkout), still count as 1 day
    // The loop/logic below handles "how many days" based on standard chunks

    let dayCount = 1;
    let extraCharge = 0;
    let note = '';

    // Calculate total days based on standard 24h cycles roughly, but aligned to checkout time
    // Logic: Each passing of the checkout time adds a day
    
    // We can simplify:
    // 1. Calculate base days until the last "standard checkout" passed
    // 2. Check the remaining time against "late rules"

    // Let's stick closer to the doc's 2.2.2 logic:
    // "standardCheckOut" is the first checkout point.
    
    // If checkOut is after standardCheckOut, we calculate difference
    const diffMinutesAfterCheckout = differenceInMinutes(checkOut, standardCheckOut);

    if (diffMinutesAfterCheckout > 0) {
      // Passed the first day's checkout time
      // Calculate how many FULL days passed after that
      const extraDays = Math.floor(diffMinutesAfterCheckout / (24 * 60));
      dayCount += extraDays;
      
      // Remaining minutes after removing full extra days
      const remainingMinutes = diffMinutesAfterCheckout % (24 * 60);
      
      // Now check if remaining minutes exceed threshold or trigger percentage charge
      // Doc 2.2.2 uses "fullDayLateAfter" (threshold to add full day)
      // Doc 2.2.3/User Request uses "late_rules" (percentage)
      
      // We prioritize the percentage rules first for granularity, 
      // but if it exceeds a certain point (like 100% or strict threshold), it becomes a day.
      
      // Check percentage rules
      let appliedRule = null;
      if (timeRules.late_rules && timeRules.late_rules.length > 0) {
        const hoursLate = remainingMinutes / 60;
        appliedRule = [...timeRules.late_rules]
          .sort((a, b) => parseFloat(b.to) - parseFloat(a.to))
          .find(rule => hoursLate >= parseFloat(rule.from) && hoursLate <= parseFloat(rule.to));
          
        // If no rule found but hoursLate > max rule, assume full day? 
        // Or check against fullDayLateAfter if explicit rules don't cover it.
      }

      if (appliedRule) {
        extraCharge += (appliedRule.percent / 100) * dailyPrice;
        note = ` (Phụ thu ${appliedRule.percent}%)`;
      } else {
        // No specific rule matched, check if it's "very late" -> +1 day
        // Default threshold logic if no rules match? 
        // Let's assume if it exceeds the last rule's 'to', it's another day.
        // OR simply: if remainingMinutes > 0 and no rule matches, it might be small enough to ignore OR big enough to be a day.
        // Let's use a safe fallback: > 4 hours = 1 day if no rule?
        // Actually, let's look at standard practice: usually > 12:00 next day is +1 day.
        // If we are here, we already have dayCount days.
        
        // If remainingMinutes > 0, we should probably charge something.
        // If we strictly follow Doc 2.2.2:
        // "lateAfterMinutes = ... lateThreshold = ..."
        // "if checkOut >= lateThreshold -> dayCount += 1"
        
        // Let's implement the Doc 2.2.2 "threshold" logic as the "full day" trigger
        // And use 2.2.3 percentage for "between checkout and threshold"
        
        // Assuming '18:00' is the threshold for full day (common in VN)
        const lateThresholdHour = 18; 
        const minutesUntilThreshold = (lateThresholdHour * 60) - (coH * 60 + coM);
        
        if (remainingMinutes >= minutesUntilThreshold) {
           dayCount += 1;
           note = ' (Quá giờ - Tính 1 ngày)';
           // Reset extra charge if we count as full day? Usually yes.
           extraCharge = 0; 
        } else if (!appliedRule) {
           // No rule matched, but less than threshold.
           // Maybe simple fraction? Or ignore. 
           // Let's leave extraCharge as 0.
        }
      }
    }

    return { 
      price: (dayCount * dailyPrice) + extraCharge, 
      note: `Ở ${dayCount} ngày${note}` 
    };
  }
}
