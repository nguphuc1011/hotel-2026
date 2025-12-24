'use client';

import { RoomStatusFilter } from './RoomStatusFilter';
import { Database } from 'lucide-react';

interface DashboardHeaderProps {
  activeFilterIds: string[];
  onToggleFilter: (id: string) => void;
  roomCounts: Record<string, number>;
}

export function DashboardHeader({
  activeFilterIds,
  onToggleFilter,
  roomCounts,
}: DashboardHeaderProps) {
  return (
    <div className="pt-4 pb-2">
      <RoomStatusFilter 
        activeFilterIds={activeFilterIds}
        onToggleFilter={onToggleFilter}
        roomCounts={roomCounts}
      />
    </div>
  );
}
