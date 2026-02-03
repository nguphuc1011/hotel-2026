'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { shiftService } from '@/services/shiftService';
import { toast } from 'react-hot-toast';
import { Plus, Trash, Save } from 'lucide-react';

interface ShiftDefinition {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export function ShiftConfiguration() {
  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDefinitions();
  }, []);

  const loadDefinitions = async () => {
    try {
      setLoading(true);
      const data = await shiftService.getShiftDefinitions();
      setDefinitions(data);
    } catch (error) {
      console.error('Error loading shift definitions:', error);
      toast.error('Lỗi tải danh sách ca làm việc');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setDefinitions([
      ...definitions,
      {
        id: 'temp-' + Date.now(),
        name: 'Ca mới',
        start_time: '08:00:00',
        end_time: '17:00:00',
        is_active: true,
      },
    ]);
  };

  const handleChange = (index: number, field: keyof ShiftDefinition, value: any) => {
    const newDefs = [...definitions];
    newDefs[index] = { ...newDefs[index], [field]: value };
    setDefinitions(newDefs);
  };

  const handleSave = async (def: ShiftDefinition) => {
    try {
      const isNew = def.id.startsWith('temp-');
      await shiftService.manageShiftDefinition({
        id: isNew ? undefined : def.id,
        name: def.name,
        start_time: def.start_time,
        end_time: def.end_time,
        is_active: def.is_active,
        action: isNew ? 'CREATE' : 'UPDATE',
      });
      toast.success('Đã lưu cấu hình ca');
      loadDefinitions();
    } catch (error) {
      console.error('Error saving shift definition:', error);
      toast.error('Lỗi lưu cấu hình');
    }
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('temp-')) {
      setDefinitions(definitions.filter((d) => d.id !== id));
      return;
    }
    
    if (!confirm('Bạn có chắc chắn muốn xóa ca này?')) return;

    try {
      await shiftService.manageShiftDefinition({
        id,
        name: '',
        start_time: '00:00:00',
        end_time: '00:00:00',
        is_active: false,
        action: 'DELETE',
      });
      toast.success('Đã xóa ca làm việc');
      loadDefinitions();
    } catch (error) {
      console.error('Error deleting shift definition:', error);
      toast.error('Lỗi xóa ca');
    }
  };

  if (loading) return <div>Đang tải cấu hình...</div>;

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">Cấu hình Khung giờ Ca làm việc</h3>
        <Button onClick={handleAdd} size="sm">
          <Plus size={16} className="mr-1" /> Thêm ca
        </Button>
      </div>

      <div className="space-y-4">
        {definitions.map((def, index) => (
          <div key={def.id} className="flex items-center gap-4 p-3 border rounded bg-gray-50">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Tên ca</label>
              <Input
                value={def.name}
                onChange={(e) => handleChange(index, 'name', e.target.value)}
                placeholder="Ví dụ: Ca Sáng"
              />
            </div>
            <div className="w-32">
              <label className="text-xs text-gray-500">Bắt đầu</label>
              <Input
                type="time"
                step="1"
                value={def.start_time}
                onChange={(e) => handleChange(index, 'start_time', e.target.value)}
              />
            </div>
            <div className="w-32">
              <label className="text-xs text-gray-500">Kết thúc</label>
              <Input
                type="time"
                step="1"
                value={def.end_time}
                onChange={(e) => handleChange(index, 'end_time', e.target.value)}
              />
            </div>
            <div className="flex flex-col items-center">
              <label className="text-xs text-gray-500 mb-2">Kích hoạt</label>
              <Switch
                checked={def.is_active}
                onCheckedChange={(checked) => handleChange(index, 'is_active', checked)}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="icon" variant="outline" onClick={() => handleSave(def)} title="Lưu">
                <Save size={16} />
              </Button>
              <Button size="icon" variant="destructive" onClick={() => handleDelete(def.id)} title="Xóa">
                <Trash size={16} />
              </Button>
            </div>
          </div>
        ))}
        {definitions.length === 0 && (
          <div className="text-center text-gray-500 py-4">Chưa có cấu hình ca nào. Hãy thêm mới.</div>
        )}
      </div>
    </Card>
  );
}
