import { useLayoutEffect, useRef } from "react";

type FittedBalanceProps = { className?: string; value: string };

export default function FittedBalance({ className, value }: FittedBalanceProps) {
  const amountRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const amount = amountRef.current;
    const container = amount?.parentElement;
    if (!amount || !container) return;

    const fit = () => {
      amount.style.fontSize = "";
      const baseSize = Number.parseFloat(window.getComputedStyle(amount).fontSize);
      const textRange = document.createRange();
      textRange.selectNodeContents(amount);
      const textWidth = textRange.getBoundingClientRect().width;
      const containerStyle = window.getComputedStyle(container);
      const rightEdge = container.getBoundingClientRect().right -
        Number.parseFloat(containerStyle.paddingRight || "0");
      const availableWidth = rightEdge - amount.getBoundingClientRect().left - 2;
      if (textWidth > availableWidth && availableWidth > 0) {
        amount.style.fontSize = `${(baseSize * availableWidth) / textWidth}px`;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    let active = true;
    document.fonts.ready.then(() => { if (active) fit(); });
    return () => { active = false; observer.disconnect(); };
  }, [className, value]);

  return <strong ref={amountRef} className={className}>{value}</strong>;
}
