import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

interface CountdownTimerProps {
  expiryDate: Date | string;
}

interface TimerElementProps {
  label: string;
  value: number;
}

// Function to calculate time left
const calculateTimeLeft = (expiryDate: Date | string): TimeLeft => {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const difference = expiry.getTime() - now.getTime();

  const time: TimeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };

  if (difference > 0) {
    time.days = Math.floor(difference / (1000 * 60 * 60 * 24));
    time.hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
    time.minutes = Math.floor((difference / (1000 * 60)) % 60);
    time.seconds = Math.floor((difference / 1000) % 60);
  }

  return time;
};

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  expiryDate,
}) => {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // Update time left every second
  useEffect(() => {
    setTimeLeft(calculateTimeLeft(expiryDate));

    const intervalId = setInterval(() => {
      setTimeLeft(calculateTimeLeft(expiryDate));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [expiryDate]);

  return (
    <div className="flex items-center w-full gap-2">
      <TimerElement
        label={t('Timer.Days', { ns: 'common' })}
        value={timeLeft.days}
      />
      <TimerElement
        label={t('Timer.Hours', { ns: 'common' })}
        value={timeLeft.hours}
      />
      <TimerElement
        label={t('Timer.Minutes', { ns: 'common' })}
        value={timeLeft.minutes}
      />
      <TimerElement
        label={t('Timer.Seconds', { ns: 'common' })}
        value={timeLeft.seconds}
      />
    </div>
  );
};

const TimerElement: React.FC<TimerElementProps> = ({ label, value }) => {
  return (
    <div className="flex flex-col items-center">
      <div className="relative bg-primary rounded-md px-2 py-1 min-w-[50px]">
        {/* Vertical line in the middle */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-white z-10" />
        <h3 className="text-lg text-white text-center tracking-[0.2em] font-mono tabular-nums">
          {value.toString().padStart(2, '0')}
        </h3>
      </div>
      <p className="text-sm font-normal text-gray-900 dark:text-white mt-1 text-center">
        {label}
      </p>
    </div>
  );
};
