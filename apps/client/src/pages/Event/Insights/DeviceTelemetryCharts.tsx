import {
  Line,
  LineChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Sample } from './event-device-api';

type Props = {
  samples: Sample[];
  locale: string;
  timezone: string;
  label: (key: string) => string;
  time: (value: string | null | undefined) => string;
};
export function DeviceTelemetryCharts({
  samples,
  locale,
  timezone,
  label,
  time,
}: Props) {
  const chart: (Partial<Sample> & { minute: string; timestamp: number })[] = [];
  for (const [index, sample] of samples.entries()) {
    const previous = samples[index - 1];
    if (
      previous &&
      +new Date(sample.minute) - +new Date(previous.minute) > 60_000
    )
      chart.push({
        minute: new Date(+new Date(previous.minute) + 60_000).toISOString(),
        timestamp: +new Date(previous.minute) + 60_000,
      });
    chart.push({ ...sample, timestamp: Date.parse(sample.minute) });
  }
  const tick = (v: string | number) =>
    new Date(v).toLocaleTimeString(locale, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <>
      {samples.length > 0 && (
        <>
          <h3 className="text-sm font-semibold">{label('Heartbeats')}</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chart}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={tick}
                tick={{
                  fill: 'var(--muted-foreground)',
                  fontSize: 12,
                }}
              />
              <YAxis />
              <Tooltip
                labelFormatter={v =>
                  Number.isFinite(Number(v))
                    ? time(new Date(Number(v)).toISOString())
                    : '—'
                }
                contentStyle={{
                  background: 'var(--popover)',
                  color: 'var(--popover-foreground)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="count" fill="var(--chart-1)" />
            </BarChart>
          </ResponsiveContainer>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            {[
              { key: 'batteryPercent', name: 'Battery', unit: '%' },
              { key: 'gsmRsrpDbm', name: 'GsmRsrp', unit: 'dBm' },
              { key: 'gsmSnrDb', name: 'GsmSnr', unit: 'dB' },
              { key: 'loraRssiDbm', name: 'LoraRssi', unit: 'dBm' },
              { key: 'loraSnrDb', name: 'LoraSnr', unit: 'dB' },
            ]
              .filter(metric =>
                samples.some(
                  sample =>
                    typeof sample[metric.key as keyof Sample] === 'number'
                )
              )
              .map(metric => (
                <div key={metric.key} className="min-w-0 rounded-md border p-4">
                  <h3 className="mb-3 text-sm font-semibold">
                    {label(metric.name)} ({metric.unit})
                  </h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chart}>
                      <CartesianGrid
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={tick}
                        tick={{
                          fill: 'var(--muted-foreground)',
                          fontSize: 12,
                        }}
                      />
                      <YAxis />
                      <Tooltip
                        labelFormatter={v =>
                          Number.isFinite(Number(v))
                            ? time(new Date(Number(v)).toISOString())
                            : '—'
                        }
                        contentStyle={{
                          background: 'var(--popover)',
                          color: 'var(--popover-foreground)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                        }}
                      />
                      <Line
                        dataKey={metric.key}
                        stroke="var(--chart-1)"
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
          </div>
        </>
      )}
    </>
  );
}
