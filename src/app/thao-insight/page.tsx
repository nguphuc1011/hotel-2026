'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Package,
  Wallet,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Activity,
  History,
  TrendingDown,
  Info,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { requestForToken, onMessageListener } from '@/lib/firebase';

interface ThaoInsightData {
  suspiciousLogs: any[];
  pendingServices: any[];
  cashIntegrity: {
    actualIncome: number;
    expectedFromBookings: number;
    discrepancy: number;
    suspicious: boolean;
  };
  inventoryWarnings: any[];
}

export default function ThaoInsight() {
  const [data, setData] = useState<ThaoInsightData>({
    suspiciousLogs: [],
    pendingServices: [],
    cashIntegrity: { actualIncome: 0, expectedFromBookings: 0, discrepancy: 0, suspicious: false },
    inventoryWarnings: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      // Kiểm tra cấu hình Supabase
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        // eslint-disable-next-line no-console
        console.error('Thiếu biến môi trường Supabase!');
        // Nếu đang ở client, chúng ta có thể kiểm tra xem client có thực sự có key không
      }

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      // 1. MẮT THẦN: Audit Logs Warning/Critical
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('*')
        .in('severity', ['warning', 'critical'])
        .order('created_at', { ascending: false })
        .limit(10);

      // 2. HÀNG TREO: view_pending_services
      const { data: pending } = await supabase.from('view_pending_services').select('*');

      // 3. KÉT TIỀN: Cashflow vs Bookings
      // Thực thu hôm nay (Tiền mặt + Chuyển khoản)
      const { data: cashflowToday } = await supabase
        .from('cashflow')
        .select('amount')
        .eq('type', 'income')
        .gte('created_at', startOfToday);

      const actualIncome = cashflowToday?.reduce((sum, t) => sum + t.amount, 0) || 0;

      // Doanh thu dự kiến từ Bookings đã thanh toán hôm nay
      const { data: bookingsToday } = await supabase
        .from('bookings')
        .select('total_amount, status')
        .eq('status', 'completed')
        .gte('updated_at', startOfToday);

      const expectedIncome = bookingsToday?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;

      // 4. CẢNH BÁO KHO: Hàng tồn thấp
      const { data: lowStock } = await supabase
        .from('services')
        .select('*')
        .lt('stock', 5)
        .eq('is_active', true);

      setData({
        suspiciousLogs: logs || [],
        pendingServices: pending || [],
        cashIntegrity: {
          actualIncome,
          expectedFromBookings: expectedIncome,
          discrepancy: actualIncome - expectedIncome,
          suspicious: Math.abs(actualIncome - expectedIncome) > 1000, // Chênh lệch > 1k là nghi vấn
        },
        inventoryWarnings: lowStock || [],
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Lỗi khi fetch insights:', error);
      toast.error('Không thể kết nối với Mật Sổ!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();

    // Yêu cầu quyền thông báo từ Bệ Hạ
    const setupNotifications = async () => {
      await requestForToken();
    };
    setupNotifications();

    // Lắng nghe thông báo khi đang mở ứng dụng
    onMessageListener()
      .then((payload: any) => {
        toast.info(payload.notification?.title || 'Thông báo mới', {
          description: payload.notification?.body,
        });
      })
      .catch(() => {
        // Error handling
      });

    // Real-time updates from Supabase
    const channel = supabase
      .channel('thao_insight_realtime')
      .on('postgres_changes', { event: '*', table: 'audit_logs' }, () => fetchInsights())
      .on('postgres_changes', { event: '*', table: 'cashflow' }, () => fetchInsights())
      .on('postgres_changes', { event: '*', table: 'bookings' }, () => fetchInsights())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const sendDemoReport = async () => {
    const token = await requestForToken();
    if (!token) {
      toast.error('Bệ Hạ chưa cho phép "Mắt Thần" gửi thông báo!', {
        description: 'Vui lòng kiểm tra cài đặt trình duyệt và cấp quyền.',
      });
      return;
    }

    toast.success('Đang gửi báo cáo "Tháo Insight" tới thiết bị của Bệ Hạ...', {
      description: 'Báo cáo đã được nén và mã hóa theo chuẩn mật mã quân sự.',
      duration: 5000,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Activity className="animate-pulse text-blue-500" size={48} />
          <p className="text-blue-200 font-black uppercase tracking-[0.3em] animate-pulse">
            Tháo đang mở mắt...
          </p>
        </div>
      </div>
    );
  }

  const totalPendingValue = data.pendingServices.reduce((sum, s) => sum + (s.total_amount || 0), 0);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-6 lg:p-10 pb-32">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
              <h1 className="text-4xl font-black text-white uppercase tracking-tighter">
                Tháo Insight
              </h1>
              <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                v1.0 Beta
              </span>
            </div>
            <p className="text-slate-400 font-bold text-sm tracking-wide uppercase italic">
              "Tháo đã nhìn thấu vạn vật - Kẻ gian khó thoát mắt thần"
            </p>
          </div>
          <Button
            onClick={sendDemoReport}
            className="h-16 px-10 rounded-2xl font-black uppercase text-xs tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-2xl shadow-blue-900/20 gap-3 transition-all active:scale-95"
          >
            <Bell size={20} /> Gửi báo cáo Demo
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1: Mắt Thần */}
          <Card className="bg-slate-900/50 border-slate-800 shadow-2xl overflow-hidden group">
            <CardHeader className="border-b border-slate-800/50 bg-slate-900/80">
              <CardTitle className="flex items-center gap-3 text-white uppercase tracking-tight text-lg">
                <ShieldAlert className="text-red-500" /> Mắt Thần Giám Sát
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {data.suspiciousLogs.length === 0 ? (
                  <div className="py-10 text-center space-y-3">
                    <CheckCircle2 className="mx-auto text-emerald-500" size={32} />
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      Giang sơn thái bình - Không có nghi vấn
                    </p>
                  </div>
                ) : (
                  data.suspiciousLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-red-500/30 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter',
                            log.severity === 'critical'
                              ? 'bg-red-500 text-white'
                              : 'bg-amber-500 text-black'
                          )}
                        >
                          {log.severity}
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold">
                          {format(new Date(log.created_at), 'HH:mm dd/MM', { locale: vi })}
                        </span>
                      </div>
                      <p className="text-xs font-black text-slate-200 mb-1">{log.action}</p>
                      <div
                        className={cn(
                          'p-2 rounded-lg text-[10px] font-bold',
                          !log.reason
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-slate-900/50 text-slate-400'
                        )}
                      >
                        {log.reason ? `Lý do: ${log.reason}` : 'CẢNH BÁO: KHÔNG CÓ LÝ DO!'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Hàng Treo */}
          <Card className="bg-slate-900/50 border-slate-800 shadow-2xl overflow-hidden group">
            <CardHeader className="border-b border-slate-800/50 bg-slate-900/80">
              <CardTitle className="flex items-center gap-3 text-white uppercase tracking-tight text-lg">
                <Package className="text-amber-500" /> Đối Soát Hàng Treo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="p-6 rounded-[2rem] bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2">
                    Tiền dịch vụ chưa thu
                  </p>
                  <p className="text-3xl font-black text-white">
                    {formatCurrency(totalPendingValue)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-2 font-bold italic">
                    Tương ứng {data.pendingServices.length} món đang tại phòng
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                    Cảnh báo kho hàng
                  </h4>
                  {data.inventoryWarnings.length === 0 ? (
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-3">
                      <CheckCircle2 className="text-emerald-500" size={16} />
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">
                        Kho bãi đầy đủ
                      </span>
                    </div>
                  ) : (
                    data.inventoryWarnings.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="text-red-500" size={16} />
                          <span className="text-[11px] font-black text-slate-200 uppercase">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-red-400">
                          Tồn: {item.stock}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Két Tiền */}
          <Card className="bg-slate-900/50 border-slate-800 shadow-2xl overflow-hidden group">
            <CardHeader className="border-b border-slate-800/50 bg-slate-900/80">
              <CardTitle className="flex items-center gap-3 text-white uppercase tracking-tight text-lg">
                <Wallet className="text-blue-500" /> Trạng Thái Két Tiền
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      Thực thu (Hôm nay)
                    </p>
                    <p className="text-sm font-black text-white">
                      {formatCurrency(data.cashIntegrity.actualIncome)}
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      Dự kiến (Bookings)
                    </p>
                    <p className="text-sm font-black text-white">
                      {formatCurrency(data.cashIntegrity.expectedFromBookings)}
                    </p>
                  </div>
                </div>

                <div
                  className={cn(
                    'p-6 rounded-[2rem] border transition-all',
                    data.cashIntegrity.suspicious
                      ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.1)]'
                      : 'bg-blue-500/10 border-blue-500/30'
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Chênh lệch đối soát
                    </span>
                    {data.cashIntegrity.suspicious && (
                      <span className="px-2 py-0.5 bg-red-500 text-white text-[8px] font-black rounded uppercase animate-bounce">
                        Nghi vấn
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      'text-3xl font-black mb-1',
                      data.cashIntegrity.suspicious ? 'text-red-500' : 'text-blue-500'
                    )}
                  >
                    {data.cashIntegrity.discrepancy > 0 ? '+' : ''}
                    {formatCurrency(data.cashIntegrity.discrepancy)}
                  </p>
                  {data.cashIntegrity.suspicious ? (
                    <p className="text-[10px] text-red-400 font-bold italic uppercase tracking-tighter">
                      "Nghi ngờ bỏ ngoài sổ sách - Cần kiểm tra ngay"
                    </p>
                  ) : (
                    <p className="text-[10px] text-blue-400 font-bold italic uppercase tracking-tighter">
                      "Sổ sách minh bạch - Khớp dữ liệu"
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                    <span>Hoạt động gần nhất</span>
                    <History size={12} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                      <span className="text-[10px] text-slate-400">
                        Vừa cập nhật dữ liệu từ Cashflow...
                      </span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <span className="text-[10px] text-slate-400">
                        Hồ nước chung (Real-time) đang kết nối.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer Insight */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-blue-800 shadow-2xl shadow-blue-900/20 relative overflow-hidden group">
            <div className="relative z-10">
              <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-3">
                <Info /> Lời răn của Tháo
              </h3>
              <p className="text-blue-100 font-bold text-sm leading-relaxed mb-6 italic">
                "Thà ta phụ người, chứ không để người phụ ta. Trong kinh doanh, thà ta nghi ngờ nhân
                viên làm sai để chấn chỉnh, còn hơn để thất thoát làm lung lay cơ nghiệp. Mắt thần
                đã mở, vạn vật đều nằm trong lòng bàn tay."
              </p>
              <Button className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl font-black uppercase text-[10px] tracking-widest py-6 px-8">
                Xem lịch sử răn dạy <ChevronRight className="ml-2" size={16} />
              </Button>
            </div>
            <Activity className="absolute -bottom-10 -right-10 text-white/5 w-64 h-64 rotate-12 group-hover:scale-110 transition-transform duration-700" />
          </div>

          <div className="p-8 rounded-[2.5rem] bg-slate-900 border border-slate-800 flex flex-col justify-center items-center text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
              <TrendingDown className="text-slate-500" size={40} />
            </div>
            <div>
              <h4 className="text-lg font-black text-white uppercase tracking-tight">
                Tháo Insight v1.1
              </h4>
              <p className="text-slate-400 text-xs font-bold px-10">
                Phiên bản tiếp theo sẽ tích hợp AI dự báo thất thoát dựa trên hành vi của nhân viên.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <div className="w-2 h-2 rounded-full bg-slate-700" />
              <div className="w-2 h-2 rounded-full bg-slate-700" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
