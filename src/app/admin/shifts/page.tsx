'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShiftConfiguration } from '@/components/admin/shifts/ShiftConfiguration';
import { ShiftHistoryTable } from '@/components/admin/shifts/ShiftHistoryTable';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PERMISSION_KEYS } from '@/services/permissionService';
import { usePermission } from '@/hooks/usePermission';
import { Card } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function AdminShiftPage() {
  const { user, isLoading: isAuthLoading } = useAuthStore();
  const { can, isLoading: isPermissionLoading } = usePermission();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Simplified protection: If not admin/authorized, show warning or redirect
  // Ideally this should be handled by middleware or layout, but doing it here for simplicity
  if (!mounted) return null;

  if (isAuthLoading || isPermissionLoading) {
      return <div className="p-8">Đang kiểm tra quyền truy cập...</div>;
  }

  // Check permission (Admin or specific permission)
  // Assuming 'VIEW_REPORTS' or a new 'MANAGE_SHIFTS' is required. 
  // Using VIEW_REPORTS for now as it's likely an Admin/Manager feature
  if (!user) {
      return <div className="p-8">Vui lòng đăng nhập.</div>;
  }
  
  // Strict check: Must have permission to view reports (Manager/Admin)
  if (!can(PERMISSION_KEYS.VIEW_REPORTS) && !can(PERMISSION_KEYS.SHIFT_FORCE_CLOSE)) {
      return (
          <div className="p-8 flex flex-col items-center gap-4">
              <AlertTriangle className="text-red-500" size={48} />
              <h1 className="text-2xl font-bold text-red-600">Truy cập bị từ chối</h1>
              <p>Bạn không có quyền truy cập trang Quản lý ca.</p>
          </div>
      );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Quản lý Ca làm việc</h1>
        <p className="text-gray-500 mt-2">
          Cấu hình khung giờ, theo dõi lịch sử vào/ra và xử lý sai lệch tiền mặt.
        </p>
      </div>

      <Tabs defaultValue="history" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="history">Lịch sử & Kiểm soát</TabsTrigger>
          <TabsTrigger value="config">Cấu hình Khung giờ</TabsTrigger>
        </TabsList>
        
        <TabsContent value="history">
          <ShiftHistoryTable />
        </TabsContent>
        
        <TabsContent value="config">
          <ShiftConfiguration />
        </TabsContent>
      </Tabs>
    </div>
  );
}
