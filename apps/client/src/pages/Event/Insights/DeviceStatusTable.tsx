import { Button } from '@/components/atoms';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Device } from './event-device-api';

type Props = {
  devices: Device[];
  selected: string;
  onSelect: (id: string) => void;
  label: (key: string) => string;
  time: (value: string | null | undefined) => string;
  locale: string;
};
export function DeviceStatusTable({
  devices,
  selected,
  onSelect,
  label,
  time,
  locale,
}: Props) {
  if (!devices.length) return null;
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {[
              'Name',
              'Status',
              'LastSeen',
              'LastPunch',
              'Upload',
              'Battery',
              'Gsm',
              'Lora',
            ].map(k => (
              <TableHead className="whitespace-nowrap" key={k}>
                {label(k)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map(d => (
            <TableRow
              key={d.id}
              data-state={selected === d.id ? 'selected' : undefined}
            >
              <TableCell className="whitespace-nowrap">
                <Button
                  variant="link"
                  className="h-auto max-w-xs justify-start whitespace-normal break-words p-0 text-left"
                  aria-pressed={selected === d.id}
                  onClick={() => onSelect(d.id)}
                >
                  {d.name}
                </Button>
                <small className="block text-muted-foreground">
                  {d.sourceType === 'uploader'
                    ? label('OtherApp')
                    : d.sourceType === 'meos'
                      ? 'MeOS'
                      : d.sourceType}{' '}
                  {d.macAddress}
                </small>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Badge
                  variant={d.status === 'offline' ? 'destructive' : 'outline'}
                  className="gap-1.5"
                >
                  <span
                    aria-hidden
                    className={
                      d.status === 'online'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : d.status === 'offline'
                          ? 'text-destructive-foreground'
                          : d.status === 'delayed'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                    }
                  >
                    ●{' '}
                  </span>
                  {label(d.status)}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {time(d.lastSeenAt)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {time(d.lastPunchAt)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {d.uploadState ? (
                  <div className="space-y-1">
                    <Badge
                      variant={
                        d.uploadState === 'failed' ? 'destructive' : 'secondary'
                      }
                    >
                      {label(`Upload_${d.uploadState}`)}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {d.uploadBytes == null
                        ? ''
                        : `${new Intl.NumberFormat(locale).format(d.uploadBytes)} B`}
                      {d.uploadState === 'processing' ||
                      d.uploadDurationMs == null
                        ? ''
                        : ` · ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(d.uploadDurationMs / 1000)} s`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {time(
                        d.uploadState === 'processing'
                          ? d.lastSeenAt
                          : d.uploadCompletedAt
                      )}
                    </p>
                  </div>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {d.batteryPercent == null ? '—' : `${d.batteryPercent}%`}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {d.gsmRsrpDbm == null ? '—' : `${d.gsmRsrpDbm} dBm`} /{' '}
                {d.gsmSnrDb ?? '—'} dB{' '}
                {d.signalBars == null
                  ? ''
                  : '▂▄▆█'.slice(0, d.signalBars) +
                    '_'.repeat(4 - d.signalBars)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {d.loraRssiDbm == null ? '—' : `${d.loraRssiDbm} dBm`} /{' '}
                {d.loraSnrDb ?? '—'} dB
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
