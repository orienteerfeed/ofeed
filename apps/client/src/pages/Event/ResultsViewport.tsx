import { Component, createRef, type ReactNode } from 'react';
import './results-viewport.css';

interface Props {
  children: ReactNode;
  className?: string;
  resetKey?: string | number;
  error?: unknown;
  splits?: boolean;
}

type ScrollSnapshot = Array<{
  element: Element;
  top: number;
  left: number;
}>;

/** Snapshot immediately before React moves rows, restore before the next paint.
 * A layout-effect cleanup runs too late to reliably capture the pre-commit DOM.
 * Scope this boundary to a view that renders whenever its live data changes. */
export class ResultsViewport extends Component<
  Props,
  object,
  ScrollSnapshot | null
> {
  private root = createRef<HTMLDivElement>();
  private headerOffsets = new WeakMap<HTMLTableSectionElement, number>();
  private frame: number | undefined;
  private resizeObserver?: ResizeObserver;

  // Keep the real header inside its horizontally scrolling table. CSS sticky
  // alone sticks to that overflow wrapper rather than to the page viewport.
  private positionHeaders = () => {
    this.frame = undefined;
    const root = this.root.current;
    if (!root) return;
    const navbar = document.querySelector('[data-navbar]');
    const navbarBottom = Math.max(
      0,
      navbar?.getBoundingClientRect().bottom ?? 0
    );
    for (const table of root.querySelectorAll('table')) {
      const header = table.tHead;
      if (!header) continue;
      // Nested ResultsViewports may share a table; only its nearest owner moves it.
      if (table.closest('.results-viewport') !== root) continue;
      let top = navbarBottom;
      for (
        let parent = table.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const { overflowY } = getComputedStyle(parent);
        if (/(auto|scroll|hidden|clip)/.test(overflowY)) {
          top = Math.max(
            top,
            parent.getBoundingClientRect().top + parent.clientTop
          );
        }
      }
      const rect = header.getBoundingClientRect();
      const naturalTop = rect.top - (this.headerOffsets.get(header) ?? 0);
      const offset = Math.max(
        0,
        Math.min(
          top - naturalTop,
          table.getBoundingClientRect().bottom - naturalTop - rect.height
        )
      );
      header.style.transform = `translateY(${offset}px)`;
      this.headerOffsets.set(header, offset);
    }
  };

  private scheduleHeaders = () => {
    if (this.frame === undefined) {
      this.frame = requestAnimationFrame(this.positionHeaders);
    }
  };

  override componentDidMount() {
    document.addEventListener('scroll', this.scheduleHeaders, true);
    window.addEventListener('resize', this.scheduleHeaders);
    this.resizeObserver = new ResizeObserver(this.scheduleHeaders);
    if (this.root.current) this.resizeObserver.observe(this.root.current);
    const navbar = document.querySelector('[data-navbar]');
    if (navbar) this.resizeObserver.observe(navbar);
    this.positionHeaders();
  }

  override componentWillUnmount() {
    document.removeEventListener('scroll', this.scheduleHeaders, true);
    window.removeEventListener('resize', this.scheduleHeaders);
    this.resizeObserver?.disconnect();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
  }

  override getSnapshotBeforeUpdate(previous: Props): ScrollSnapshot | null {
    const root = this.root.current;
    if (!root || previous.resetKey !== this.props.resetKey) return null;
    const elements = new Set<Element>([
      ...root.querySelectorAll(
        '[data-slot="table-container"], [data-result-scroll]'
      ),
      root,
    ]);
    for (
      let parent = root.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      elements.add(parent);
    }
    if (document.scrollingElement) elements.add(document.scrollingElement);
    return [...elements].map(element => ({
      element,
      top: element.scrollTop,
      left: element.scrollLeft,
    }));
  }

  override componentDidUpdate(
    _previous: Props,
    _state: object,
    snapshot: ScrollSnapshot | null
  ) {
    for (const { element, top, left } of snapshot ?? []) {
      // DOM properties clamp naturally if a successful snapshot removed rows.
      if (element.scrollTop !== top) element.scrollTop = top;
      if (element.scrollLeft !== left) element.scrollLeft = left;
    }
    this.scheduleHeaders();
  }

  override render() {
    const { children, className = '', error, splits } = this.props;
    const message =
      error instanceof Error ? error.message : error ? String(error) : '';
    return (
      <div
        ref={this.root}
        className={`results-viewport ${splits ? 'results-viewport-splits' : ''} ${className}`}
      >
        {children}
        {message && (
          <div
            role="status"
            title={message}
            className="results-refresh-error text-destructive bg-background border rounded px-2 text-xs truncate"
          >
            {message}
          </div>
        )}
      </div>
    );
  }
}
