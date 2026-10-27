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
