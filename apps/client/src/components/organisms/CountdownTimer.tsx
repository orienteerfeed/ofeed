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
  const s = value.toString().padStart(2, '0');

  return (
    <div className="flex flex-col items-center">
      <div className="relative bg-primary rounded-md min-w-[56px] h-10 px-3">
        {/* vertical dividing line in the middle of the box */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/80 z-10" />

        {/* two cells, each digit exactly in the middle of its half */}
        <div className="grid grid-cols-2 h-full w-full place-items-center gap-x-2">
          <span className="font-mono tabular-nums text-lg leading-none text-white z-20">
            {s[0]}
          </span>
          <span className="font-mono tabular-nums text-lg leading-none text-white z-20">
            {s[1]}
          </span>
        </div>
      </div>

      <p className="text-sm font-normal text-gray-900 dark:text-white mt-1 text-center">
        {label}
      </p>
    </div>
  );
};
