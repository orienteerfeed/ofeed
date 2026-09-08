import { describe, expect, it } from 'vitest';
import { buildAnnouncement } from '../../../src/pages/Event/WinnerNotifications';

const winner = (
  className: string,
  name = 'Nováková Jana',
  classSex: 'B' | 'M' | 'F' | null = null
) => ({
  eventId: 'e1',
  classId: 1,
  className,
  classSex,
  name,
});

const female = (text: string) => expect(text).toContain('se dostala ');
const male = (text: string) => expect(text).toMatch(/se dostal [^a]/);

describe('buildAnnouncement', () => {
  it('prefers the configured class sex over the class name', () => {
    female(buildAnnouncement(winner('H21', 'Novák Jan', 'F')));
    male(buildAnnouncement(winner('D21', 'Nováková Jana', 'M')));
  });

  it.each(['D21', 'D10C', 'W21E', 'w35'])(
    'falls back to the class name for %s',
    className => {
      female(buildAnnouncement(winner(className, 'Novák Jan', 'B')));
    }
  );

  it.each(['H21', 'H35', 'M21E', 'm40'])(
    'falls back to the class name for %s',
    className => {
      male(buildAnnouncement(winner(className, 'Nováková Jana', 'B')));
    }
  );

  it.each(['Nováková Jana', 'Krátká Eva', 'Novakova Jana'])(
    'uses the surname for mixed classes: %s',
    name => {
      female(buildAnnouncement(winner('OPEN', name, 'B')));
    }
  );

  it.each(['Novák Jan', 'Svoboda Petr', 'Costa Bruno'])(
    'stays masculine for mixed classes: %s',
    name => {
      male(buildAnnouncement(winner('OPEN', name, 'B')));
    }
  );

  it('works when the server sends no class sex', () => {
    female(buildAnnouncement(winner('D21', 'Nováková Jana', null)));
    male(buildAnnouncement(winner('T2', 'Novák Jan', null)));
  });

  it('includes the class name', () => {
    expect(buildAnnouncement(winner('D21'))).toContain('v kategorii D21');
  });
});
