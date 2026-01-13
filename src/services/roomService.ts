
import { supabase } from '@/lib/supabase';
import { RoomCategory } from './settingsService';

export interface Room {
  id: string;
  name: string; // Display name (usually room number)
  room_number: string; // DB column might be room_number
  category_id: string;
  category?: RoomCategory;
  status: 'available' | 'occupied' | 'dirty' | 'repair';
  floor?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export const roomService = {
  async getRooms(): Promise<Room[]> {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select(`
          *,
          category:room_categories(*)
        `)
        .order('room_number', { ascending: true });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        ...item,
        name: item.room_number || item.name, // Fallback
        room_number: item.room_number || item.name // Ensure both exist
      }));
    } catch (err) {
      console.error('Error fetching rooms:', err);
      return [];
    }
  },

  async createRoom(room: Partial<Room>): Promise<Room | null> {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert([{
          room_number: room.name || room.room_number,
          category_id: room.category_id,
          status: room.status || 'available',
          floor: room.floor,
          notes: room.notes
        }])
        .select()
        .single();

      if (error) throw error;

      return data ? { ...data, name: data.room_number } : null;
    } catch (err) {
      console.error('Error creating room:', JSON.stringify(err, null, 2));
      console.error(err);
      return null;
    }
  },

  async updateRoom(id: string, room: Partial<Room>): Promise<Room | null> {
    try {
      const updatePayload: any = {};
      if (room.name || room.room_number) updatePayload.room_number = room.name || room.room_number;
      if (room.category_id) updatePayload.category_id = room.category_id;
      if (room.status) updatePayload.status = room.status;
      if (room.floor) updatePayload.floor = room.floor;
      if (room.notes) updatePayload.notes = room.notes;

      const { data, error } = await supabase
        .from('rooms')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data ? { ...data, name: data.room_number } : null;
    } catch (err) {
      console.error('Error updating room:', err);
      return null;
    }
  },

  async deleteRoom(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error deleting room:', err);
      return false;
    }
  }
};
