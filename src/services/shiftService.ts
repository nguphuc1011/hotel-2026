import { supabase } from '@/lib/supabase';

export interface Shift {
  id: string;
  staff_id: string;
  start_time: string;
  end_time: string | null;
  start_cash: number;
  end_cash_system: number | null;
  status: 'open' | 'closed';
  created_at: string;
}

export interface ShiftReport {
  id: string;
  shift_id: string;
  declared_cash: number;
  system_cash: number;
  variance: number;
  notes: string | null;
  created_at: string;
}

export const shiftService = {
  // Lấy ca làm việc hiện tại của nhân viên (nếu có)
  async getCurrentShift(staffId: string) {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('staff_id', staffId)
      .eq('status', 'open')
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "Row not found"
    return data as Shift | null;
  },

  // Mở ca làm việc mới
  async openShift(staffId: string, startCash: number) {
    const { data, error } = await supabase.rpc('open_shift', {
      p_staff_id: staffId,
      p_start_cash: startCash
    });

    if (error) throw error;
    return data;
  },

  // Đóng ca (Blind Close)
  async closeShift(shiftId: string, declaredCash: number, notes: string) {
    const { data, error } = await supabase.rpc('close_shift', {
      p_shift_id: shiftId,
      p_declared_cash: declaredCash,
      p_notes: notes
    });

    if (error) throw error;
    return data;
  },

  // Lấy lịch sử ca làm việc
  async getShiftHistory(page: number = 1, pageSize: number = 20) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from('shifts')
      .select(`
        *,
        staff:staff(full_name),
        report:shift_reports(*)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { data, count };
  }
};
