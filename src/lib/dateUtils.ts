
/**
 * Utility functions for handling dates in Local Timezone (Vietnam/User's System)
 * Prevents off-by-one day errors caused by UTC conversion.
 */

/**
 * Returns the date string in YYYY-MM-DD format based on LOCAL time.
 * Use this for <input type="date" value={...} />
 */
export const toLocalISOString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parses a YYYY-MM-DD string into a Date object at 00:00:00 LOCAL time.
 * Avoids the UTC trap of new Date('YYYY-MM-DD').
 */
export const parseLocalISO = (isoDateString: string): Date => {
  if (!isoDateString) return new Date();
  const [year, month, day] = isoDateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Returns a new Date object representing the end of the day in LOCAL time.
 * (23:59:59.999 Local -> Converted to Date object)
 */
export const getEndOfDay = (date: Date = new Date()): Date => {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
};

/**
 * Returns a new Date object representing the start of the day in LOCAL time.
 * (00:00:00.000 Local)
 */
export const getStartOfDay = (date: Date = new Date()): Date => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};

/**
 * Returns current date object with correct local time logic preserved if needed for calculations
 * (Standard new Date() is usually sufficient for logic, but this is for explicit clarity)
 */
export const getNow = (): Date => {
  return new Date();
};

/**
 * Formats a date for display in Vietnamese format (HH:mm dd/MM/yyyy)
 */
export const formatDateTimeVi = (dateString: string | Date): string => {
  if (!dateString) return '';
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

/**
 * Formats a date for display (dd/MM/yyyy)
 */
export const formatDateVi = (dateString: string | Date): string => {
  if (!dateString) return '';
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};
