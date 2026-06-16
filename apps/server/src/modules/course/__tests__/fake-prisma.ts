/**
 * Minimal in-memory Prisma stand-in for the course module tests.
 *
 * It implements just enough of the Prisma Client surface used by the IOF
 * CourseData import and the course read helpers: simple equality `where`
 * matching (plus `{ in: [...] }`), `select` projection, `orderBy`, and the
 * nested `class → course → courseControls → control` include. There is no real
 * transactional isolation — `$transaction` simply runs the callback against the
 * same store, which is sufficient for these unit tests.
 */

type Row = Record<string, any>;

export type FakeSeed = {
  events?: Row[];
  classes?: Row[];
  controls?: Row[];
  courses?: Row[];
  courseControls?: Row[];
  courseMaps?: Row[];
  competitors?: Row[];
};

function matchCondition(value: unknown, condition: unknown): boolean {
  if (condition && typeof condition === 'object') {
    if ('in' in (condition as Row)) {
      return ((condition as Row).in as unknown[]).includes(value);
    }
    if ('not' in (condition as Row)) {
      const not = (condition as Row).not;
      if (not === null) return value !== null && value !== undefined;
      return value !== not;
    }
  }
  return value === condition;
}

function matchWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as Row[]).some((sub) => matchWhere(row, sub));
    }
    if (key === 'AND') {
      return (condition as Row[]).every((sub) => matchWhere(row, sub));
    }
    return matchCondition(row[key], condition);
  });
}

function project(row: Row, select: Row | undefined): Row {
  if (!select) return { ...row };
  const result: Row = {};
  for (const key of Object.keys(select)) {
    if (select[key]) result[key] = row[key];
  }
  return result;
}

export function createFakePrisma(seed: FakeSeed = {}) {
  const store = {
    events: [...(seed.events ?? [])],
    classes: [...(seed.classes ?? [])],
    controls: [...(seed.controls ?? [])],
    courses: [...(seed.courses ?? [])],
    courseControls: [...(seed.courseControls ?? [])],
    courseMaps: [...(seed.courseMaps ?? [])],
    competitors: [...(seed.competitors ?? [])],
  };

  let seq = 1000;
  const nextId = () => ++seq;

  function collection(rows: Row[]) {
    return {
      async findUnique({ where, select }: { where?: Row; select?: Row } = {}) {
        const row = rows.find((r) => matchWhere(r, where));
        return row ? project(row, select) : null;
      },
      async findFirst({ where, select }: { where?: Row; select?: Row } = {}) {
        const row = rows.find((r) => matchWhere(r, where));
        return row ? project(row, select) : null;
      },
      async findMany({
        where,
        select,
        orderBy,
      }: { where?: Row; select?: Row; orderBy?: Row } = {}) {
        let found = rows.filter((r) => matchWhere(r, where));
        if (orderBy) {
          const [key, dir] = Object.entries(orderBy)[0] as [string, 'asc' | 'desc'];
          found = [...found].sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key]));
        }
        return found.map((r) => project(r, select));
      },
      async create({ data }: { data: Row }) {
        const row: Row = { id: nextId(), ...data };
        rows.push(row);
        return { ...row };
      },
      async update({ where, data }: { where: Row; data: Row }) {
        const row = rows.find((r) => matchWhere(r, where));
        if (!row) throw new Error('Record to update not found');
        Object.assign(row, data);
        return { ...row };
      },
      async updateMany({ where, data }: { where?: Row; data: Row }) {
        const found = rows.filter((r) => matchWhere(r, where));
        found.forEach((r) => Object.assign(r, data));
        return { count: found.length };
      },
      async deleteMany({ where }: { where?: Row } = {}) {
        let count = 0;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (matchWhere(rows[i], where)) {
            rows.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
      async count({ where }: { where?: Row } = {}) {
        return rows.filter((r) => matchWhere(r, where)).length;
      },
    };
  }

  const eventDelegate = collection(store.events);
  const controlDelegate = collection(store.controls);
  const courseDelegate = collection(store.courses);
  const courseControlDelegate = collection(store.courseControls);
  const courseMapDelegate = collection(store.courseMaps);
  const competitorDelegate = collection(store.competitors);
  const classCollection = collection(store.classes);

  const classDelegate = {
    ...classCollection,
    async findUnique({ where, include }: { where: Row; include?: Row }) {
      const cls = store.classes.find((r) => matchWhere(r, where));
      if (!cls) return null;
      if (!include?.course) return { ...cls };

      const course = store.courses.find((c) => c.id === cls.courseId) ?? null;
      let courseWithControls: Row | null = null;
      if (course) {
        const include2 = include.course.include;
        let courseControls = store.courseControls.filter((cc) => cc.courseId === course.id);
        if (include2?.courseControls) {
          const orderBy = include2.courseControls.orderBy;
          if (orderBy?.sequence) {
            courseControls = [...courseControls].sort((a, b) =>
              orderBy.sequence === 'desc' ? b.sequence - a.sequence : a.sequence - b.sequence,
            );
          }
          const wantControl = Boolean(include2.courseControls.include?.control);
          courseControls = courseControls.map((cc) => ({
            ...cc,
            control: wantControl
              ? store.controls.find((ctrl) => ctrl.id === cc.controlId) ?? null
              : undefined,
          }));
        }
        courseWithControls = { ...course, courseControls };
      }

      return { ...cls, course: courseWithControls };
    },
  };

  const prisma = {
    store,
    event: eventDelegate,
    class: classDelegate,
    control: controlDelegate,
    course: courseDelegate,
    courseControl: courseControlDelegate,
    courseMap: courseMapDelegate,
    competitor: competitorDelegate,
    async $transaction(fn: (tx: any) => Promise<unknown>) {
      return fn(prisma);
    },
  };

  return prisma;
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;
