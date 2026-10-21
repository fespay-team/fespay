import { ChevronRight, Info, ScanLine } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import FittedBalance from "../FittedBalance";
import { formatYen as yen } from "../money";
import { DEMO_PAYMENT_QR_VALUE } from "./AppShared";

type PaymentPageProps = {
  balance: bigint;
  balanceSizeClass: string;
  eventName: string;
  onScan: () => void;
};

export default function PaymentPage({
  balance,
  balanceSizeClass,
  eventName,
  onScan,
}: PaymentPageProps) {
  return (
    <main className="payment-content">
      <section
        className="payment-qr-panel"
        aria-labelledby="payment-qr-heading"
      >
        <div className="payment-qr-panel-top">
          <h1 id="payment-qr-heading">支払い用QR</h1>
          <span className="payment-demo-tag">DEMO</span>
        </div>
        <div
          className="payment-qr-art"
          role="img"
          aria-label="支払い用デモQRコード"
        >
          <QRCodeSVG
            value={DEMO_PAYMENT_QR_VALUE}
            size={190}
            level="M"
            marginSize={4}
            bgColor="#ffffff"
            fgColor="#17234c"
          />
        </div>
        <p>お店のスタッフに、このQRを見せてください。</p>
        <span className="payment-qr-caption">
          読み取りやすいように画面を明るくしてください
        </span>
      </section>
      <section
        className={`payment-balance${balanceSizeClass ? " is-expanded" : ""}`}
        aria-label="現在の残高"
      >
        <span>
          <span>現在の残高</span>
          <small>{eventName}</small>
        </span>
        <FittedBalance className={balanceSizeClass} value={yen(balance)} />
      </section>
      <button className="payment-scan-button" type="button" onClick={onScan}>
        <span className="payment-scan-icon">
          <ScanLine size={25} />
        </span>
        <span className="payment-scan-copy">
          <strong>QRをスキャンする</strong>
          <small>お店のQRを読み取る</small>
        </span>
        <ChevronRight size={20} />
      </button>
      <p className="payment-note">
        <Info size={15} /> この画面はデモです。実際の支払いはできません。
      </p>
    </main>
  );
}
