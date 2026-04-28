import { useEffect, useRef, useState } from 'react';

interface MobileClubNameProps {
  clubName: string;
  referenceText: string;
  onSelectClub?: (clubName: string) => void;
  className?: string;
}

let canvasContext: CanvasRenderingContext2D | null | undefined;

const getCanvasContext = (): CanvasRenderingContext2D | null => {
  if (canvasContext !== undefined) {
    return canvasContext;
  }

  if (typeof document === 'undefined') {
    canvasContext = null;
    return canvasContext;
  }

  canvasContext = document.createElement('canvas').getContext('2d');
  return canvasContext;
};

const measureTextWidth = (text: string, font: string): number => {
  const context = getCanvasContext();

  if (!context) {
    return text.length * 7;
  }

  context.font = font;
  return context.measureText(text).width;
};

const normalizeText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim();

const trimToWordBoundary = (
  text: string,
  direction: 'start' | 'end'
): string => {
  if (!text.includes(' ')) {
    return text;
  }

  return direction === 'start'
    ? text.replace(/\s+\S*$/, '').trimEnd()
    : text.replace(/^\S*\s+/, '').trimStart();
};

const makeMiddleTruncationCandidate = (
  text: string,
  visibleCharacters: number,
  useWordBoundaries: boolean
): string => {
  const startLength = Math.max(1, Math.ceil(visibleCharacters * 0.6));
  const endLength = Math.max(1, visibleCharacters - startLength);
  const start = text.slice(0, startLength);
  const end = text.slice(text.length - endLength);

  if (!useWordBoundaries) {
    return `${start.trimEnd()}...${end.trimStart()}`;
  }

  const boundedStart = trimToWordBoundary(start, 'start');
  const boundedEnd = trimToWordBoundary(end, 'end');

  if (boundedStart.length === 0 || boundedEnd.length === 0) {
    return `${start.trimEnd()}...${end.trimStart()}`;
  }

  return `${boundedStart}...${boundedEnd}`;
};

const truncateMiddleToWidth = (
  text: string,
  maxWidth: number,
  font: string
): string => {
  const normalizedText = normalizeText(text);

  if (
    normalizedText.length === 0 ||
    maxWidth <= 0 ||
    measureTextWidth(normalizedText, font) <= maxWidth
  ) {
    return normalizedText;
  }

  let best = '...';
  let low = 2;
  let high = Math.max(2, normalizedText.length - 1);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const wordBoundaryCandidate = makeMiddleTruncationCandidate(
      normalizedText,
      mid,
      true
    );
    const candidate =
      measureTextWidth(wordBoundaryCandidate, font) <= maxWidth
        ? wordBoundaryCandidate
        : makeMiddleTruncationCandidate(normalizedText, mid, false);

    if (measureTextWidth(candidate, font) <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
};

export const MobileClubName = ({
  clubName,
  referenceText,
  onSelectClub,
  className,
}: MobileClubNameProps) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const referenceElementRef = useRef<HTMLSpanElement | null>(null);
  const [displayName, setDisplayName] = useState(() => normalizeText(clubName));
  const [maxWidth, setMaxWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    const referenceElement = referenceElementRef.current;
    if (!element || !referenceElement || !clubName || !referenceText) {
      setDisplayName(normalizeText(clubName));
      setMaxWidth(null);
      return;
    }

    const updateDisplayName = () => {
      const styles = window.getComputedStyle(element);
      const font = styles.font;
      const referenceWidth = Math.ceil(
        referenceElement.getBoundingClientRect().width
      );

      setMaxWidth(referenceWidth);
      setDisplayName(truncateMiddleToWidth(clubName, referenceWidth, font));
    };

    updateDisplayName();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(updateDisplayName);
    resizeObserver.observe(referenceElement);

    return () => resizeObserver.disconnect();
  }, [clubName, referenceText]);

  if (!clubName) {
    return null;
  }

  const commonProps = {
    className,
    ref: (node: HTMLElement | null) => {
      elementRef.current = node;
    },
    style: maxWidth ? { maxWidth } : undefined,
    title: clubName,
  };

  const referenceMeasure = (
    <span
      ref={referenceElementRef}
      aria-hidden="true"
      className="pointer-events-none absolute -z-10 whitespace-pre text-sm font-medium opacity-0"
    >
      {normalizeText(referenceText)}
    </span>
  );

  if (onSelectClub) {
    return (
      <>
        {referenceMeasure}
        <button
          {...commonProps}
          type="button"
          onClick={() => onSelectClub(clubName)}
        >
          {displayName}
        </button>
      </>
    );
  }

  return (
    <>
      {referenceMeasure}
      <span {...commonProps}>{displayName}</span>
    </>
  );
};
