import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Info,
  Search,
  Send,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import FlowDialog from "./FlowDialog";
import { formatYen, MAX_MONEY_DIGITS, validateMoneyInput } from "./money";
import type { SendReceipt } from "./domain/ledger";
import "./send-flow.css";

export type SendRecipient = { id: string; name: string };

type SendFlowProps = {
  balance: bigint;
  senderName: string;
  recipients: SendRecipient[];
  onClose: () => void;
  onSend: (
    recipientId: string,
    amount: bigint,
    message: string,
  ) => Promise<SendReceipt | null>;
};

type Stage = "recipient" | "amount" | "review" | "receipt";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SendFlow({
  balance,
  senderName,
  recipients,
  onClose,
  onSend,
}: SendFlowProps) {
  const [stage, setStage] = useState<Stage>("recipient");
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState<SendRecipient | null>(null);
  const [amountText, setAmountText] = useState("");
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<SendReceipt | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // The ref blocks a second submit before React has rendered isSubmitting.
  const submitted = useRef(false);

  const closeFlow = () => {
    if (!submitted.current || stage === "receipt") onClose();
  };

  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  const visibleRecipients = recipients.filter(
    (person) =>
      person.name.toLocaleLowerCase("ja-JP").includes(normalizedQuery) ||
      person.id.toLocaleLowerCase("ja-JP").includes(normalizedQuery),
  );
  const amountResult = validateMoneyInput(amountText);
  const amount = amountResult.amount ?? 0n;
  const amountError =
    amountResult.error ?? (amount > balance ? "残高が不足しています" : "");
  const canContinue = !amountError && recipient !== null;

  const goBack = () => {
    if (submitted.current) return;
    setSubmitError("");
    if (stage === "review") setStage("amount");
    if (stage === "amount") setStage("recipient");
  };

  const confirmSend = async () => {
    if (submitted.current || !recipient || amountError || stage !== "review")
      return;
    submitted.current = true;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const outcome = await onSend(recipient.id, amount, message.trim());
      if (!outcome) {
        submitted.current = false;
        setSubmitError(
          "送金デモを完了できませんでした。残高と金額を確認して、もう一度お試しください。",
        );
        return;
      }
      setReceipt(outcome);
      setStage("receipt");
    } catch {
      submitted.current = false;
      setSubmitError(
        "送金の保存に失敗しました。ブラウザーの保存設定を確認して、もう一度お試しください。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = stage === "recipient" ? 1 : stage === "amount" ? 2 : 3;

  return (
    <FlowDialog
      overlayClassName="send-flow-overlay"
      panelClassName="send-flow"
      headingId="send-flow-heading"
      focusKey={stage}
      onClose={closeFlow}
      closeOnBackdrop
    >
      <header className="flow-dialog__header send-flow__header">
        {stage === "amount" || (stage === "review" && !submitted.current) ? (
          <button
            className="flow-dialog__icon-button send-flow__icon-button"
            type="button"
            aria-label="前の画面へ戻る"
            onClick={goBack}
          >
            <ArrowLeft size={21} />
          </button>
        ) : (
          <span className="send-flow__header-spacer" />
        )}
        <div className="send-flow__header-title">
          <span>DEMO</span>
          <strong>送る</strong>
        </div>
        <button
          className="flow-dialog__icon-button send-flow__icon-button"
          type="button"
          aria-label="送金画面を閉じる"
          onClick={closeFlow}
          disabled={isSubmitting}
        >
          <X size={21} />
        </button>
      </header>

      {stage !== "receipt" && (
        <div
          className="flow-dialog__progress send-flow__progress"
          aria-label={`ステップ ${progress} / 3`}
        >
          {[1, 2, 3].map((step) => (
            <span
              className={`flow-dialog__progress-bar send-flow__progress-bar${step <= progress ? " is-current" : ""}`}
              key={step}
            />
          ))}
        </div>
      )}

      <div className="flow-dialog__scroll send-flow__scroll">
        {stage !== "receipt" && (
          <p className="send-flow__demo-note">
            <Info size={16} aria-hidden="true" />
            これはデモです。実際のお金は相手に送られません。
          </p>
        )}

        {stage === "recipient" && (
          <>
            <div className="send-flow__eyebrow">STEP 1 / 3</div>
            <h2 id="send-flow-heading" tabIndex={-1}>
              送る相手を選ぶ
            </h2>
            <p className="send-flow__lead">
              このブラウザーのサンプルアカウントを名前または ID
              で探してください。
            </p>
            <label
              className="send-flow__search"
              htmlFor="send-recipient-search"
            >
              <Search size={19} aria-hidden="true" />
              <span className="send-flow__sr-only">
                名前または FesPay ID で送金先を検索
              </span>
              <input
                id="send-recipient-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="名前・FesPay IDで検索"
              />
            </label>
            <div className="send-flow__list-heading">
              <strong>送金先</strong>
              <span>{visibleRecipients.length}人</span>
            </div>
            {visibleRecipients.length > 0 ? (
              <div className="send-flow__recipient-list">
                {visibleRecipients.map((person) => (
                  <button
                    className="send-flow__recipient"
                    type="button"
                    key={person.id}
                    onClick={() => {
                      setRecipient(person);
                      setStage("amount");
                    }}
                    aria-label={`${person.name}、FesPay ID ${person.id} に送る`}
                  >
                    <span className="send-flow__avatar" aria-hidden="true">
                      <UserRound size={24} />
                    </span>
                    <span>
                      <strong>{person.name}</strong>
                      <small>FesPay ID {person.id}</small>
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="send-flow__empty" role="status">
                <Search size={24} aria-hidden="true" />
                <strong>相手が見つかりません</strong>
                <span>名前か ID を変えて検索してください。</span>
              </div>
            )}
            <div className="send-flow__balance-card">
              <WalletCards size={19} aria-hidden="true" />
              <span>送れる残高</span>
              <strong>{formatYen(balance)}</strong>
            </div>
          </>
        )}

        {stage === "amount" && recipient && (
          <>
            <div className="send-flow__eyebrow">STEP 2 / 3</div>
            <h2 id="send-flow-heading" tabIndex={-1}>
              金額を入力
            </h2>
            <p className="send-flow__lead">
              {recipient.name}さんに送る金額を入力してください。
            </p>
            <div className="send-flow__selected-person">
              <span className="send-flow__avatar" aria-hidden="true">
                <UserRound size={22} />
              </span>
              <span>
                <small>送金先</small>
                <strong>{recipient.name}</strong>
                <small>FesPay ID {recipient.id}</small>
              </span>
              <Check size={19} aria-hidden="true" />
            </div>
            <label className="send-flow__field-label" htmlFor="send-amount">
              送る金額
            </label>
            <div className="send-flow__amount-field">
              <span aria-hidden="true">¥</span>
              <input
                id="send-amount"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                placeholder="0"
                aria-describedby="send-amount-help send-amount-error"
                aria-invalid={Boolean(amountText && amountError)}
              />
              <span>円</span>
            </div>
            <div className="send-flow__amount-meta">
              <span id="send-amount-help">
                1円単位、{MAX_MONEY_DIGITS}桁まで入力できます
              </span>
              <span>残高 {formatYen(balance)}</span>
            </div>
            <p
              className="send-flow__field-error"
              id="send-amount-error"
              role="status"
            >
              {amountText
                ? amountError
                : balance === 0n
                  ? "残高がありません。先にチャージしてください。"
                  : ""}
            </p>
            <label className="send-flow__field-label" htmlFor="send-message">
              メッセージ <span>任意</span>
            </label>
            <textarea
              className="send-flow__message-field"
              id="send-message"
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, 50))}
              maxLength={50}
              rows={3}
              placeholder="例：屋台代ありがとう！"
              aria-describedby="send-message-help"
            />
            <p className="send-flow__message-help" id="send-message-help">
              相手に添えるひとこと · {message.length}/50文字
            </p>
          </>
        )}

        {stage === "review" && recipient && (
          <>
            <div className="send-flow__eyebrow">STEP 3 / 3</div>
            <h2 id="send-flow-heading" tabIndex={-1}>
              送る内容を確認
            </h2>
            <p className="send-flow__lead">
              相手と金額を確認してから確定してください。
            </p>
            <div className="send-flow__review-card">
              <div className="send-flow__review-person">
                <span className="send-flow__avatar" aria-hidden="true">
                  <UserRound size={25} />
                </span>
                <span>
                  <small>送金先</small>
                  <strong>{recipient.name}</strong>
                  <small>FesPay ID {recipient.id}</small>
                </span>
              </div>
              <div className="send-flow__review-amount">
                <span>送る金額</span>
                <strong>{formatYen(amount)}</strong>
              </div>
            </div>
            <dl className="send-flow__review-details">
              <div>
                <dt>送り主</dt>
                <dd>{senderName}</dd>
              </div>
              {message.trim() && (
                <div>
                  <dt>メッセージ</dt>
                  <dd>{message.trim()}</dd>
                </div>
              )}
              <div>
                <dt>送金後の残高</dt>
                <dd>{amountError ? "—" : formatYen(balance - amount)}</dd>
              </div>
            </dl>
            <p className="send-flow__review-note">
              <Info size={17} aria-hidden="true" />
              確定すると、このブラウザー内のデモ残高と履歴が更新されます。
            </p>
          </>
        )}

        {stage === "receipt" && receipt && (
          <>
            <div className="send-flow__success-icon" aria-hidden="true">
              <CheckCircle2 size={45} strokeWidth={1.8} />
            </div>
            <h2
              id="send-flow-heading"
              className="send-flow__success-title"
              tabIndex={-1}
            >
              送金デモが完了しました
            </h2>
            <p className="send-flow__success-lead">
              {receipt.recipientName}さんへの送金を、デモ履歴に記録しました。
            </p>
            <div className="send-flow__receipt-amount">
              <span>送った金額</span>
              <strong>{formatYen(receipt.amount)}</strong>
            </div>
            <dl className="send-flow__review-details send-flow__receipt-details">
              <div>
                <dt>送金先</dt>
                <dd>{receipt.recipientName}</dd>
              </div>
              <div>
                <dt>日時</dt>
                <dd>{formatDate(receipt.completedAt)}</dd>
              </div>
              <div>
                <dt>送金後の残高</dt>
                <dd>{formatYen(receipt.balanceAfter)}</dd>
              </div>
              <div>
                <dt>取引ID</dt>
                <dd>{receipt.transactionId}</dd>
              </div>
            </dl>
            <p className="send-flow__review-note">
              <Info size={17} aria-hidden="true" />
              これはデモです。実際のお金は相手に送られていません。
            </p>
          </>
        )}
      </div>

      {stage !== "recipient" && (
        <footer className="flow-dialog__footer send-flow__footer">
          {stage === "amount" && (
            <button
              className="flow-dialog__primary send-flow__primary"
              type="button"
              disabled={!canContinue}
              onClick={() => setStage("review")}
            >
              内容を確認する <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
          {stage === "review" && (
            <>
              {(amountError || submitError) && (
                <p className="send-flow__submit-error" role="alert">
                  {amountError
                    ? `${amountError}。金額を変更してから、もう一度確認してください。`
                    : submitError}
                </p>
              )}
              <button
                className="flow-dialog__primary send-flow__primary send-flow__confirm"
                type="button"
                disabled={isSubmitting || Boolean(amountError)}
                onClick={confirmSend}
              >
                <Send size={18} aria-hidden="true" />{" "}
                {isSubmitting ? "記録中…" : "送金デモを確定する"}
              </button>
            </>
          )}
          {stage === "receipt" && (
            <button
              className="flow-dialog__primary send-flow__primary"
              type="button"
              onClick={closeFlow}
            >
              ホームへ戻る
            </button>
          )}
        </footer>
      )}
    </FlowDialog>
  );
}
