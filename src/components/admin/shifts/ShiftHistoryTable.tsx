'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { shiftService } from '@/services/shiftService';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, CheckCircle, Clock, DollarSign, Lock } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';

interface ShiftHistory {
  id: string;
  staff_name: string;
  start_time: string;
  end_time: string | null;
  status: 'open' | 'closed';
  start_cash: number;
  end_cash_system: number | null;
  shift_report?: {
    declared_cash: number;
    variance: number;
    audit_status: 'pending' | 'approved' | 'adjusted' | 'rejected';
    notes: string;
  };
}

interface ShiftDefinition {
  id: string;
  start_time: string;
  end_time: string;
}

export function ShiftHistoryTable() {
  const [shifts, setShifts] = useState<ShiftHistory[]>([]);
  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const { can } = usePermission();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [shiftsData, defsData] = await Promise.all([
        shiftService.getHistory(),
        shiftService.getShiftDefinitions()
      ]);
      setShifts(shiftsData as any); // Type assertion needed due to complex join
      setDefinitions(defsData);
    } catch (error) {
      console.error('Error loading shift history:', error);
      toast.error('Lỗi tải lịch sử ca');
    } finally {
      setLoading(false);
    }
  };

  const checkTimeCompliance = (shiftStart: string, shiftEnd: string | null) => {
    if (!shiftStart) return null;
    
    const start = new Date(shiftStart);
    const startTimeString = format(start, 'HH:mm:ss');
    
    // Find matching shift definition (simplistic logic: closest start time)
    // Real logic might be more complex depending on rules
    let matchedDef = definitions[0]; // Default to first
    let minDiff = 24 * 60;

    for (const def of definitions) {
        // Calculate difference in minutes (simplified)
        const defH = parseInt(def.start_time.split(':')[0]);
        const startH = start.getHours();
        const diff = Math.abs(defH - startH);
        if (diff < minDiff) {
            minDiff = diff;
            matchedDef = def;
        }
    }

    if (!matchedDef) return null;

    const compliance = [];
    
    // Check Late In (Allow 15 mins grace)
    const defStart = new Date(start);
    const [h, m, s] = matchedDef.start_time.split(':').map(Number);
    defStart.setHours(h, m, s);
    
    if (start.getTime() > defStart.getTime() + 15 * 60 * 1000) {
        const diffMinutes = Math.floor((start.getTime() - defStart.getTime()) / 60000);
        compliance.push(<Badge variant="destructive" className="mr-1">Vào trễ {diffMinutes}p</Badge>);
    }

    // Check Early Out
    if (shiftEnd) {
        const end = new Date(shiftEnd);
        const defEnd = new Date(end);
        const [eh, em, es] = matchedDef.end_time.split(':').map(Number);
        defEnd.setHours(eh, em, es);
        
        // Handle overnight shifts if needed (omitted for brevity)
        
        if (end.getTime() < defEnd.getTime() - 15 * 60 * 1000) {
             const diffMinutes = Math.floor((defEnd.getTime() - end.getTime()) / 60000);
             compliance.push(<Badge variant="outline" className="text-orange-500 border-orange-500 mr-1">Ra sớm {diffMinutes}p</Badge>);
        }
    }

    return compliance.length > 0 ? compliance : <span className="text-green-600 text-xs">Đúng giờ</span>;
  };

  const handleForceClose = async (shift: ShiftHistory) => {
    if (!can(PERMISSION_KEYS.SHIFT_FORCE_CLOSE)) {
        toast.error('Bạn không có quyền đóng ca hộ!');
        return;
    }
    if (!confirm(`Bạn có chắc chắn muốn ĐÓNG CA HỘ cho nhân viên ${shift.staff_name}?`)) return;

    try {
        const result = await shiftService.closeShift(shift.id, 0, 'Admin Force Close - Đóng ca hộ');
        if (result.success) {
            toast.success('Đã đóng ca hộ thành công');
            loadData();
        } else {
            toast.error(result.message || 'Lỗi đóng ca');
        }
    } catch (error) {
        toast.error('Lỗi hệ thống');
    }
  };

  const handleResolveVariance = async (shiftId: string, type: 'ADJUST' | 'IGNORE') => {
      const note = prompt(type === 'ADJUST' ? 'Nhập lý do hạch toán:' : 'Nhập lý do bỏ qua sai lệch:');
      if (note === null) return;

      try {
          const result = await shiftService.resolveShiftVariance(shiftId, type, note, user?.id || '');
          if (result.success) {
              toast.success('Đã xử lý sai lệch');
              loadData();
          } else {
              toast.error(result.message || 'Lỗi xử lý');
          }
      } catch (error) {
          toast.error('Lỗi hệ thống');
      }
  };

  if (loading) return <div>Đang tải dữ liệu...</div>;

  return (
    <Card className="p-4 mt-6">
      <h3 className="text-lg font-bold mb-4">Bảng Theo dõi Lịch sử Ca</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nhân viên</TableHead>
            <TableHead>Giờ vào/Ra</TableHead>
            <TableHead>Soi giờ</TableHead>
            <TableHead>Trạng thái tiền</TableHead>
            <TableHead>Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shifts.map((shift) => (
            <TableRow key={shift.id}>
              <TableCell className="font-medium">{shift.staff_name}</TableCell>
              <TableCell>
                <div className="flex flex-col text-xs">
                    <span>IN: {format(new Date(shift.start_time), 'dd/MM HH:mm')}</span>
                    {shift.end_time && <span>OUT: {format(new Date(shift.end_time), 'dd/MM HH:mm')}</span>}
                </div>
              </TableCell>
              <TableCell>
                {checkTimeCompliance(shift.start_time, shift.end_time)}
              </TableCell>
              <TableCell>
                {shift.status === 'open' ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700">Đang mở</Badge>
                ) : (
                    <div className="flex flex-col text-xs gap-1">
                        <div className="flex justify-between w-40">
                            <span>Máy:</span>
                            <span className="font-mono">{formatCurrency(shift.end_cash_system || 0)}</span>
                        </div>
                        <div className="flex justify-between w-40">
                            <span>Thực tế:</span>
                            <span className="font-mono">{formatCurrency(shift.shift_report?.declared_cash || 0)}</span>
                        </div>
                        {shift.shift_report && shift.shift_report.variance !== 0 && (
                            <div className={`flex justify-between w-40 font-bold ${shift.shift_report.variance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                <span>Lệch:</span>
                                <span>{formatCurrency(shift.shift_report.variance)}</span>
                            </div>
                        )}
                        {shift.shift_report?.audit_status && (
                            <Badge variant="secondary" className="w-fit mt-1">
                                {shift.shift_report.audit_status}
                            </Badge>
                        )}
                    </div>
                )}
              </TableCell>
              <TableCell>
                {shift.status === 'open' ? (
                     <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => handleForceClose(shift)}
                        title="Đóng ca hộ (Admin)"
                     >
                        <Lock size={14} className="mr-1" /> Đóng ca hộ
                     </Button>
                ) : (
                    shift.shift_report?.variance !== 0 && shift.shift_report?.audit_status === 'pending' && (
                        <div className="flex gap-2">
                            <Button 
                                size="sm" 
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => handleResolveVariance(shift.id, 'ADJUST')}
                            >
                                <DollarSign size={14} className="mr-1" /> Hạch toán
                            </Button>
                            <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleResolveVariance(shift.id, 'IGNORE')}
                            >
                                <CheckCircle size={14} className="mr-1" /> Bỏ qua
                            </Button>
                        </div>
                    )
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
