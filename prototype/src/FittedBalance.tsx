import { useLayoutEffect, useRef } from "react";

type FittedBalanceProps = {
  className?: string;
  value: string;
};

// Product requirement: show every balance digit on one line, even after a
// 30-digit charge. Keep the measurements and resize subscriptions here so
// the page components only need to provide the formatted amount.
export default function FittedBalance({
  className,
  value,
}: FittedBalanceProps) {
  const amountRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const amount = amountRef.current;
    const container = amount?.parentElement;
    if (!amount || !container) return;

    // Keep the CSS-sized copy out of layout so measuring never enlarges the
    // visible balance or changes the observed container's height.
    const measure = amount.cloneNode(true) as HTMLElement;
    measure.setAttribute("aria-hidden", "true");
    measure.style.position = "absolute";
    measure.style.visibility = "hidden";
    measure.style.pointerEvents = "none";
    measure.style.width = "max-content";
    measure.style.maxWidth = "none";
    measure.style.whiteSpace = "nowrap";
    measure.style.fontSize = "";
    container.appendChild(measure);
    const textRange = document.createRange();
    textRange.selectNodeContents(measure);

    const fit = () => {
      const baseSize = Number.parseFloat(
        window.getComputedStyle(measure).fontSize,
      );
      const textWidth = textRange.getBoundingClientRect().width;
      const containerStyle = window.getComputedStyle(container);
      const rightEdge =
        container.getBoundingClientRect().right -
        Number.parseFloat(containerStyle.paddingRight || "0");
      const availableWidth =
        rightEdge - amount.getBoundingClientRect().left - 2;

      if (textWidth <= 0 || availableWidth <= 0) return;
      const fontSize =
        textWidth > availableWidth
          ? `${((baseSize * availableWidth) / textWidth).toFixed(3)}px`
          : "";
      if (amount.style.fontSize !== fontSize) amount.style.fontSize = fontSize;
    };

    fit();
    let animationFrame: number | null = null;
    const scheduleFit = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        fit();
      });
    };
    let observedWidth = container.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const width = container.getBoundingClientRect().width;
      if (Math.abs(width - observedWidth) < 0.1) return;
      observedWidth = width;
      scheduleFit();
    });
    observer.observe(container);
    // The CSS font size can change with vw even when the card width is fixed.
    window.addEventListener("resize", scheduleFit);
    let active = true;
    document.fonts.ready.then(() => {
      if (active) scheduleFit();
    });

    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", scheduleFit);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      measure.remove();
    };
  }, [className, value]);

  return (
    <strong ref={amountRef} className={className}>
      {value}
    </strong>
  );
}
