import { escapeInsightHtml, cardInsightPrintHtml } from './card-insight.utils';

/** Capture SVG charts with resolved theme colours so print works in a new window. */
export function entryReportPrintHtml(
  title: string,
  language: string,
  sections: (string | number)[][][],
  container: HTMLElement | null,
  financialTitle?: string
) {
  const charts = [
    ...(container?.querySelectorAll<HTMLElement>('[data-entry-report-chart]') ??
      []),
  ]
    .sort(
      (a, b) =>
        ['cumulative', 'race', 'daily', 'payments', 'categories'].indexOf(
          a.dataset.entryReportChart ?? ''
        ) -
        ['cumulative', 'race', 'daily', 'payments', 'categories'].indexOf(
          b.dataset.entryReportChart ?? ''
        )
    )
    .flatMap(section => {
      const originals = [
        ...section.querySelectorAll<SVGSVGElement>(
          '.recharts-wrapper > svg.recharts-surface'
        ),
      ];
      return originals.map(original => {
        const clone = original.cloneNode(true) as SVGSVGElement;
        const sources = [original, ...original.querySelectorAll('*')];
        const targets = [clone, ...clone.querySelectorAll('*')];
        sources.forEach((source, index) => {
          const style = getComputedStyle(source);
          for (const property of [
            'fill',
            'stroke',
            'color',
            'font-size',
            'font-family',
          ])
            targets[index]!.setAttribute(
              property,
              style.getPropertyValue(property)
            );
        });
        const svg = new XMLSerializer().serializeToString(clone);
        const bytes = new TextEncoder().encode(svg);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const kind = section.dataset.entryReportChart;
        const wide = ['cumulative', 'race', 'categories'].includes(kind ?? '');
        const tall = Number(original.getAttribute('height')) > 400;
        return `<section class="report-chart${wide ? ' report-wide' : ''}${tall ? ' report-tall' : ''}"><h2>${escapeInsightHtml(section.querySelector('h2')?.textContent ?? '')}</h2><img alt="" src="data:image/svg+xml;base64,${btoa(binary)}"><p>${escapeInsightHtml([...section.querySelectorAll('.recharts-legend-item-text')].map(item => item.textContent ?? '').join(' · ') || section.querySelector('.recharts-legend-wrapper')?.textContent || '')}</p></section>`;
      });
    })
    .join('');
  // Put metadata and financial totals before the charts, followed by detail tables.
  const financialIndex = financialTitle
    ? sections.findIndex(section => section[0]?.[0] === financialTitle)
    : -1;
  const ordered =
    financialIndex > 0
      ? [
          sections[0]!,
          sections[financialIndex]!,
          ...sections
            .slice(1)
            .filter((_, index) => index + 1 !== financialIndex),
        ]
      : sections;
  const html = cardInsightPrintHtml(title, language, ordered).replace(
    /<table>(<tr>.*?<\/tr>)(.*?)<\/table>/gs,
    (_match, head: string, body: string) =>
      `<table><thead>${head}</thead><tbody>${body}</tbody></table>`
  );
  let tables = 0;
  const insertionTable = financialIndex > 0 ? 2 : 1;
  const withCharts = html.replace(/<\/table>/g, match =>
    ++tables === insertionTable
      ? `${match}<div class="report-charts">${charts}</div>`
      : match
  );
  const output = tables
    ? withCharts
    : withCharts.replace(
        '</h1>',
        `</h1><div class="report-charts">${charts}</div>`
      );
  return output
    .replace('size:landscape', 'size:A4 landscape')
    .replace(
      '</style>',
      '.report-charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.report-chart{break-inside:avoid;min-width:0}.report-chart h2{font-size:14px;margin:8px 0}.report-chart p{font-size:10px;margin:4px 0}.report-chart img{width:100%;max-height:180px;object-fit:contain}.report-wide{grid-column:1/-1}.report-tall img{max-height:450px}table{font-size:10px}th,td{padding:4px}thead{display:table-header-group}h2{break-after:avoid}</style>'
    );
}
