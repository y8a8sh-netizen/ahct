import React from 'react';
import { formatScheduleDateCell } from '../utils/helpers';

interface ScheduleDateDisplayProps {
  date: string;
  className?: string;
  dayClassName?: string;
  gregClassName?: string;
  hijriClassName?: string;
}

const ScheduleDateDisplay: React.FC<ScheduleDateDisplayProps> = ({
  date,
  className = '',
  dayClassName = 'font-bold text-tvtc-green',
  gregClassName = 'text-sm font-medium text-gray-800',
  hijriClassName = 'text-xs text-tvtc-green font-medium',
}) => {
  if (!date) return <span className={className}>---</span>;

  const { dayName, gregorian, hijri } = formatScheduleDateCell(date);

  return (
    <div className={className}>
      <div className={dayClassName}>{dayName}</div>
      <div className={gregClassName}>{gregorian} م</div>
      {hijri && <div className={hijriClassName}>{hijri}</div>}
    </div>
  );
};

export default ScheduleDateDisplay;
