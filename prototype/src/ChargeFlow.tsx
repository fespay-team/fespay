import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import FlowDialog from "./FlowDialog";
import { formatYen, MAX_CHARGE_DIGITS, validateMoneyInput } from "./money";
import type { ChargeOutcome } from "./domain/ledger";
import "./charge-flow.css";

type ChargeFlowProps = {
  balance: bigint;
  eventName: string;
  displayName: string;
  verificationCode: string;
  onClose: () => void;
  onComplete: (outcome: ChargeOutcome) => Promise<ChargeOutcome | null>;
};

type Stage = "qr" | "identity" | "amount" | "review" | "receipt";

const stageNumber: Record<Stage, number> = {
  qr: 1,
  identity: 2,
  amount: 3,
  review: 4,
  // Step 5 records the cash receipt after confirmation on the review screen.
  receipt: 6,
};

function createDemoId() {
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8).toUpperCase()
      : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `DEMO-CHG-${Date.now().toString(36).toUpperCase()}-${unique}`;
}

function formatCompletedAt(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function ChargeFlow({
  balance,
  eventName,
  displayName,
  verificationCode,
  onClose,
  onComplete,
}: ChargeFlowProps) {
  const [stage, setStage] = useState<Stage>("qr");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [receipt, setReceipt] = useState<ChargeOutcome | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [qrStart] = useState(() => Date.now());
  const [qrSession] = useState(createDemoId);
  // The ref blocks a second submit before React has rendered isSubmitting.
  const completed = useRef(false);

  const closeFlow = () => {
    if (!completed.current || stage === "receipt") onClose();
  };

  useEffect(() => {
    if (stage !== "qr") return;
    setClockTick(Date.now());
    const timer = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const qrElapsed = Math.max(0, clockTick - qrStart);
  const qrSlot = Math.floor(qrElapsed / 60_000);
  const secondsRemaining = 60 - (Math.floor(qrElapsed / 1000) % 60);
  const countdown =
    secondsRemaining === 60
      ? "01:00"
      : `00:${String(secondsRemaining).padStart(2, "0")}`;
  const qrValue = `FESPAY-DEMO-CHARGE-RECEPTION:${qrSession}:${qrSlot}`;
  const amountResult = validateMoneyInput(amountText);
  const amountError =
    amountText === "" || amountResult.error === null
      ? null
      : `${amountResult.error}。`;
  const validAmount = amountResult.amount !== null;
  const amount = amountResult.amount ?? 0n;

  const goBack = () => {
    if (completed.current) return;
    setSubmitError("");
    if (stage === "identity") setStage("qr");
    if (stage === "amount") setStage("identity");
    if (stage === "review") {
      setCashConfirmed(false);
      setStage("amount");
    }
  };

  const confirmCash = async () => {
    if (
      completed.current ||
      stage !== "review" ||
      !validAmount ||
      !identityConfirmed ||
      !cashConfirmed
    )
      return;
    completed.current = true;
    setIsSubmitting(true);
    setSubmitError("");
    const outcome: ChargeOutcome = {
      transactionId: createDemoId(),
      amount,
      completedAt: new Date().toISOString(),
      eventName,
      displayName,
      verificationCode,
      balanceAfter: balance + amount,
    };
    try {
      const committedOutcome = await onComplete(outcome);
      if (!committedOutcome) {
        completed.current = false;
        setSubmitError(
          "チャージを記録できませんでした。残高とブラウザーの保存設定を確認して、もう一度お試しください。",
        );
        return;
      }
      setReceipt(committedOutcome);
      setStage("receipt");
    } catch {
      completed.current = false;
      setSubmitError(
        "チャージの保存に失敗しました。ブラウザーの保存設定を確認して、もう一度お試しください。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const step = stageNumber[stage];
  const isVisitor = stage === "qr";
  const isReceipt = stage === "receipt";
  const title = {
    qr: "チャージ受付用QRを表示",
    identity: "来場者情報を照合",
    amount: "チャージ金額を入力",
    review: "現金を受け取って確認",
    receipt: "チャージ完了",
  }[stage];

  return (
    <FlowDialog
      overlayClassName="charge-flow-overlay"
      panelClassName="charge-flow"
      headingId="charge-flow-title"
      focusKey={stage}
      onClose={closeFlow}
    >
      <header className="flow-dialog__header charge-flow__header">
        <button
          className="flow-dialog__icon-button charge-flow__icon-button"
          type="button"
          onClick={goBack}
          disabled={stage === "qr" || isReceipt || isSubmitting}
          aria-label="前の画面に戻る"
        >
          <ArrowLeft size={21} />
        </button>
        <span className="charge-flow__header-title">現金チャージ</span>
        <button
          className="flow-dialog__icon-button charge-flow__icon-button"
          type="button"
          onClick={closeFlow}
          disabled={isSubmitting}
          aria-label="チャージ画面を閉じる"
        >
          <X size={21} />
        </button>
      </header>

      <div
        className="flow-dialog__progress charge-flow__progress"
        aria-label={`全6工程中、工程${step}`}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <span
            key={index}
            className={`flow-dialog__progress-bar charge-flow__progress-bar${index < step ? " is-current" : ""}`}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="flow-dialog__scroll charge-flow__scroll">
        <div className="charge-flow__intro">
          <span
            className={`charge-flow__role${isVisitor ? " is-visitor" : ""}`}
          >
            {isReceipt ? (
              <CheckCircle2 size={15} />
            ) : isVisitor ? (
              <UserRound size={15} />
            ) : (
              <ShieldCheck size={15} />
            )}
            {isReceipt
              ? "来場者・受付スタッフ"
              : isVisitor
                ? "来場者の画面"
                : "受付スタッフの操作（デモ）"}
          </span>
          <span className="charge-flow__step">
            {String(step).padStart(2, "0")} / 06
          </span>
        </div>
        <h2 id="charge-flow-title" tabIndex={-1}>
          {title}
        </h2>

        {stage === "qr" && (
          <>
            <p className="charge-flow__lead">
              受付スタッフにこの画面を見せてください。QRはチャージ受付専用です。
            </p>
            <div className="charge-flow__qr-card">
              <div className="charge-flow__qr-head">
                <span>
                  <ScanLine size={17} /> チャージ受付
                </span>
                <strong>DEMO</strong>
              </div>
              <div
                className="charge-flow__qr-art"
                aria-label="デモ用チャージ受付QRコード"
              >
                <QRCodeSVG
                  value={qrValue}
                  size={210}
                  level="M"
                  marginSize={4}
                  bgColor="#ffffff"
                  fgColor="#1a315e"
                />
              </div>
              <span className="charge-flow__qr-timer">
                <Clock3 size={15} /> 表示の更新まで {countdown}
              </span>
            </div>
            <div className="charge-flow__identity-preview">
              <div>
                <span>対象イベント</span>
                <strong>{eventName}</strong>
              </div>
              <div>
                <span>表示名</span>
                <strong>{displayName}</strong>
              </div>
              <div>
                <span>照合番号</span>
                <strong className="charge-flow__code">
                  {verificationCode}
                </strong>
              </div>
            </div>
            <p className="charge-flow__notice">
              <Info size={16} />{" "}
              デモ用の表示です。実際の読み取り・入金には使えません。
            </p>
          </>
        )}

        {stage === "identity" && (
          <>
            <p className="charge-flow__lead">
              QRを読み取った後の画面を再現しています。来場者と一緒に3項目を確認してください。
            </p>
            <div className="charge-flow__section-label">
              <ScanLine size={16} /> 読み取り結果（デモ）
            </div>
            <div className="charge-flow__detail-card">
              <div>
                <span>対象イベント</span>
                <strong>{eventName}</strong>
              </div>
              <div>
                <span>表示名</span>
                <strong>{displayName}</strong>
              </div>
              <div>
                <span>照合番号</span>
                <strong className="charge-flow__code">
                  {verificationCode}
                </strong>
              </div>
            </div>
            <label className="charge-flow__check-row">
              <input
                type="checkbox"
                checked={identityConfirmed}
                onChange={(event) => setIdentityConfirmed(event.target.checked)}
              />
              <span>来場者とスタッフで3項目が一致することを確認しました</span>
            </label>
            <p className="charge-flow__notice">
              <Info size={16} />{" "}
              このプロトタイプではカメラによるQR読み取りは行いません。
            </p>
          </>
        )}

        {stage === "amount" && (
          <>
            <p className="charge-flow__lead">
              受付スタッフが来場者から受け取る予定の金額を入力してください。
            </p>
            <div className="charge-flow__context">
              <span>対象イベント</span>
              <strong>{eventName}</strong>
            </div>
            <label
              className="charge-flow__amount-label"
              htmlFor="charge-flow-amount"
            >
              チャージする金額
            </label>
            <div
              className={`charge-flow__amount-input-wrap${amountError ? " is-error" : ""}`}
            >
              <span aria-hidden="true">¥</span>
              <input
                id="charge-flow-amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                placeholder="0"
                aria-invalid={amountError !== null}
                aria-describedby="charge-flow-amount-help"
              />
              <span aria-hidden="true">円</span>
            </div>
            <p
              id="charge-flow-amount-help"
              className={`charge-flow__input-help${amountError ? " is-error" : ""}`}
              aria-live="polite"
            >
              {amountError ??
                `1円以上、${MAX_CHARGE_DIGITS}桁以内の整数を入力してください。`}
            </p>
            <div
              className="charge-flow__amount-presets"
              aria-label="金額の候補"
            >
              {[1000, 3000, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmountText(String(preset))}
                >
                  {formatYen(BigInt(preset))}
                </button>
              ))}
            </div>
            <div className="charge-flow__amount-summary">
              <WalletCards size={18} />
              <span>現在の残高</span>
              <strong>{formatYen(balance)}</strong>
            </div>
          </>
        )}

        {stage === "review" && (
          <>
            <p className="charge-flow__lead">
              来場者から現金を受け取る前に、金額を一緒に確認してください。
            </p>
            <div className="charge-flow__money-card">
              <div
                className={`charge-flow__money-row${amountText.length > 9 ? " is-long" : ""}`}
              >
                <span>
                  <Banknote size={22} /> 受け取る現金
                </span>
                <strong>{formatYen(amount)}</strong>
              </div>
              <div className="charge-flow__equals">同額</div>
              <div
                className={`charge-flow__money-row${amountText.length > 9 ? " is-long" : ""}`}
              >
                <span>
                  <WalletCards size={22} /> 追加する残高
                </span>
                <strong>{formatYen(amount)}</strong>
              </div>
            </div>
            <div className="charge-flow__review-meta">
              <div>
                <span>対象イベント</span>
                <strong>{eventName}</strong>
              </div>
              <div>
                <span>表示名 / 照合番号</span>
                <strong>
                  {displayName} / {verificationCode}
                </strong>
              </div>
              <div>
                <span>チャージ後の残高</span>
                <strong>{formatYen(balance + amount)}</strong>
              </div>
            </div>
            <label className="charge-flow__check-row charge-flow__cash-check">
              <input
                type="checkbox"
                checked={cashConfirmed}
                disabled={isSubmitting}
                onChange={(event) => setCashConfirmed(event.target.checked)}
              />
              <span>
                来場者から現金{formatYen(amount)}
                を受け取り、金額を確認しました
              </span>
            </label>
            <p className="charge-flow__notice">
              <Info size={16} />{" "}
              現金を受け取ってから「現金受領確認」を押してください。
            </p>
          </>
        )}

        {stage === "receipt" && receipt && (
          <>
            <p className="charge-flow__lead">
              来場者と受付スタッフで、完了内容を確認してください。
            </p>
            <div className="charge-flow__processed">
              <CheckCircle2 size={18} />
              <span>⑤ デモ残高への追加と取引記録を完了</span>
            </div>
            <div
              className={`charge-flow__success${receipt.amount.toString().length > 9 ? " is-long" : ""}`}
            >
              <span className="charge-flow__success-icon">
                <Check size={32} strokeWidth={3} />
              </span>
              <span>チャージ金額</span>
              <strong>{formatYen(receipt.amount)}</strong>
              <small>現金と同額をデモ残高に追加しました</small>
            </div>
            <div className="charge-flow__section-label">
              <ReceiptText size={17} /> 取引内容
            </div>
            <div className="charge-flow__detail-card charge-flow__receipt-details">
              <div>
                <span>完了時刻</span>
                <strong>{formatCompletedAt(receipt.completedAt)}</strong>
              </div>
              <div>
                <span>更新後の残高</span>
                <strong>{formatYen(receipt.balanceAfter)}</strong>
              </div>
              <div>
                <span>取引ID</span>
                <strong className="charge-flow__transaction-id">
                  {receipt.transactionId}
                </strong>
              </div>
              <div>
                <span>対象イベント</span>
                <strong>{receipt.eventName}</strong>
              </div>
            </div>
            <p className="charge-flow__notice">
              <Info size={16} />{" "}
              この取引は端末内のデモ記録です。実際の入金やバックエンドへの保存は行っていません。
            </p>
          </>
        )}
      </div>

      <footer className="flow-dialog__footer charge-flow__footer">
        {stage === "qr" && (
          <button
            className="flow-dialog__primary charge-flow__primary"
            type="button"
            onClick={() => setStage("identity")}
          >
            スタッフ側の読み取りを体験 <ArrowRight size={19} />
          </button>
        )}
        {stage === "identity" && (
          <button
            className="flow-dialog__primary charge-flow__primary"
            type="button"
            disabled={!identityConfirmed}
            onClick={() => setStage("amount")}
          >
            一致を確認して次へ <ArrowRight size={19} />
          </button>
        )}
        {stage === "amount" && (
          <button
            className="flow-dialog__primary charge-flow__primary"
            type="button"
            disabled={!validAmount}
            onClick={() => setStage("review")}
          >
            金額を確認する <ArrowRight size={19} />
          </button>
        )}
        {stage === "review" && (
          <>
            {submitError && (
              <p className="charge-flow__submit-error" role="alert">
                {submitError}
              </p>
            )}
            <button
              className="flow-dialog__primary charge-flow__primary charge-flow__confirm"
              type="button"
              disabled={!cashConfirmed || isSubmitting}
              onClick={confirmCash}
            >
              {isSubmitting ? "記録中…" : "現金受領確認"} <Check size={20} />
            </button>
            <button
              className="charge-flow__secondary"
              type="button"
              onClick={goBack}
              disabled={isSubmitting}
            >
              金額を修正する
            </button>
          </>
        )}
        {stage === "receipt" && (
          <button
            className="flow-dialog__primary charge-flow__primary"
            type="button"
            onClick={closeFlow}
          >
            ホームに戻る
          </button>
        )}
      </footer>
    </FlowDialog>
  );
}
